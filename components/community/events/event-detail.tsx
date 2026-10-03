"use client"

/**
 * ===========================================================================
 *  ONE EVENT
 * ===========================================================================
 * /community/<slug>/events/<eventId>, inside the member shell. What it is,
 * when (in the viewer's own zone, with the host's zone beside it when they
 * differ), where, who is going, and one card with what to do: answer
 * (Going, or Join the waitlist when it is full), join the call, add it to a
 * calendar.
 *
 * THE JOIN LINK is not on the page until the server puts it there: from 15
 * minutes before the start, for a member the event is open to. The page
 * waits for that moment and asks again (GET /api/community/<id>/events/<id>),
 * so a page left open shows "Join now" on time without a reload.
 *
 * Over, the replay plays at the top (components/video/storelib-video.tsx).
 */
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, CalendarDays, CalendarPlus, Check, Clock3, Loader2, Lock, MapPin, Users, Video } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { CARD, PRIMARY, SECONDARY } from "@/components/library/library-ui"
import { StorelibVideo } from "@/components/video/storelib-video"
import { cn } from "@/lib/utils"
import { eventTime } from "@/lib/communities/format"
import type { RsvpStatus } from "@/lib/communities/types"
import { KIND_WORDS, goingLabel, isLive, isOver, type EventDetailView } from "./model"
import { clockIn, useViewerZone, zoneCity } from "./use-zone"

export interface EventDetailProps {
  event: EventDetailView
  eventsHref: string
  aboutHref: string
}

/** "Thursday, October 8" in a zone. */
function longDate(iso: string, timeZone?: string): string {
  const t = Date.parse(iso)
  try {
    return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone }).format(t)
  } catch {
    return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(t)
  }
}

/** "For Pro members", "From level 3", "For owners of The Course", "For moderators". */
function lockHeading(lock: NonNullable<EventDetailView["locked"]>): string {
  switch (lock.reason) {
    case "level":
      return `From ${lock.label.toLowerCase()}`
    case "product":
    case "role":
      return `For ${lock.label.charAt(0).toLowerCase()}${lock.label.slice(1)}`
    default:
      return `For ${lock.label}`
  }
}

export function EventDetail({ event: initial, eventsHref, aboutHref }: EventDetailProps) {
  const [event, setEvent] = useState(initial)
  const zone = useViewerZone(initial.timezone)
  const [rsvp, setRsvp] = useState<{ status: RsvpStatus | null; going: number; capacity: number | null }>({ status: initial.myRsvp, going: initial.goingCount, capacity: initial.capacity })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/community/${event.communityId}/events/${event.id}`, { cache: "no-store", credentials: "same-origin" })
      if (!res.ok) return
      const body = (await res.json()) as { event?: EventDetailView }
      if (body.event) setEvent(body.event)
    } catch {
      /* The page keeps what it has. */
    }
  }, [event.communityId, event.id])

  /* When the join window opens (or the event ends), ask the server again. */
  useEffect(() => {
    const opens = event.joinOpensAt ? Date.parse(event.joinOpensAt) : NaN
    const targets = [opens, Date.parse(event.startsAt), event.endsAt ? Date.parse(event.endsAt) : Date.parse(event.startsAt) + 3_600_000].filter((t) => Number.isFinite(t) && t > Date.now())
    if (targets.length === 0) return
    const next = Math.min(...targets)
    const wait = next - Date.now()
    if (wait > 2 ** 31 - 1) return
    const id = setTimeout(() => {
      setNow(Date.now())
      void refresh()
    }, wait + 500)
    return () => clearTimeout(id)
  }, [event.joinOpensAt, event.startsAt, event.endsAt, refresh, now])

  const answer = async (going: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/community/${event.communityId}/events/${event.id}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ going }),
        credentials: "same-origin",
      })
      const body = (await res.json().catch(() => ({}))) as { status?: RsvpStatus; goingCount?: number; capacity?: number | null; message?: string }
      if (!res.ok) setError(body.message || "That did not save. Try again.")
      else setRsvp({ status: body.status === "cancelled" ? null : (body.status ?? null), going: body.goingCount ?? rsvp.going, capacity: body.capacity ?? rsvp.capacity })
    } catch {
      setError("That did not save. Check your connection and try again.")
    }
    setBusy(false)
  }

  const over = isOver(event, now)
  const live = !event.cancelled && isLive(event, now)
  const differs = zone && zone !== event.timezone
  const start = Date.parse(event.startsAt)
  const full = Boolean(rsvp.capacity && rsvp.going >= rsvp.capacity)

  return (
    <article data-event-page={event.id} className="pb-10">
      <Link href={eventsHref} className="mb-3 inline-flex h-10 items-center gap-1.5 rounded-[10px] pr-2 text-[14px] font-medium text-[#4b5563] hover:text-[#1a1a2e]">
        <ArrowLeft className="h-4 w-4" />
        Events
      </Link>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-6">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          {event.replayVideoId ? (
            <div className="-mx-4 mb-5 sm:mx-0" data-event-replay>
              <StorelibVideo communityId={event.communityId} videoId={event.replayVideoId} poster={event.coverUrl} title={`${event.title} replay`} eager />
            </div>
          ) : event.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.coverUrl} alt="" className="mb-5 aspect-[2/1] w-full rounded-2xl border border-[#e4e7ec]/80 object-cover" data-event-cover />
          ) : null}

          <p className="flex flex-wrap items-center gap-x-2 text-[13px] font-medium text-[#6b7280]">
            {event.kind !== "online" ? <span>{KIND_WORDS[event.kind]}</span> : null}
            {live ? <span className="font-semibold text-[#b42318]">Live now</span> : null}
            {event.cancelled ? <span className="font-semibold text-[#b42318]">Cancelled</span> : over ? <span>Ended</span> : null}
          </p>
          <h1 className={`mt-1 text-[24px] font-bold leading-tight tracking-[-0.01em] sm:text-[28px] ${event.cancelled ? "text-[#6b7280]" : "text-[#1a1a2e]"}`}>{event.title}</h1>

          <ul className="mt-4 space-y-3" data-event-facts>
            <li className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#e4e7ec] bg-white text-[#4b5563]">
                <CalendarDays className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 pt-0.5">
                <span className="block text-[15px] font-semibold text-[#1a1a2e]" data-event-date>
                  {longDate(event.startsAt, zone)}
                </span>
                <span className="block text-[13px] text-[#6b7280]" data-event-time>
                  {eventTime(event.startsAt, event.endsAt, { timeZone: zone }).replace(/^[^,]+, [^,]+, /, "")}
                  {differs ? ` · ${clockIn(event.startsAt, event.timezone)} in ${zoneCity(event.timezone)}` : ""}
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#e4e7ec] bg-white text-[#4b5563]">
                {event.online ? <Video className="h-4 w-4" aria-hidden /> : <MapPin className="h-4 w-4" aria-hidden />}
              </span>
              <span className="min-w-0 pt-0.5">
                <span className="block break-words text-[15px] font-semibold text-[#1a1a2e]">{event.online ? "Online" : event.location}</span>
                {!event.online ? (
                  <span className="block text-[13px] text-[#6b7280]">In person</span>
                ) : event.meetingUrl ? (
                  <span className="block text-[13px] text-[#6b7280]">The link is ready</span>
                ) : event.joinOpensAt && !over ? (
                  <span className="block text-[13px] text-[#6b7280]">The link is on this page 15 minutes before the start</span>
                ) : null}
              </span>
            </li>
            {event.host ? (
              <li className="flex gap-3">
                <AppAvatar src={event.host.avatarUrl} name={event.host.name} size={40} alt="" className="shrink-0" />
                <span className="min-w-0 pt-0.5">
                  <span className="block truncate text-[15px] font-semibold text-[#1a1a2e]">{event.host.name}</span>
                  <span className="block text-[13px] text-[#6b7280]">Host</span>
                </span>
              </li>
            ) : null}
          </ul>
        </div>

        {/* What to do: beside the event on a computer, under its facts on a phone. */}
        <aside className={`${CARD} p-4 lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1`} data-event-actions aria-label="Your answer">
          {event.cancelled ? (
            <p className="text-[15px] font-semibold text-[#1a1a2e]">This event was cancelled.</p>
          ) : event.locked ? (
            <div data-event-locked>
              <p className="flex items-center gap-2 text-[15px] font-semibold text-[#1a1a2e]">
                <Lock className="h-4 w-4" aria-hidden />
                {lockHeading(event.locked)}
              </p>
              <p className="mt-1 text-[14px] text-[#6b7280]">This event is not part of your membership.</p>
              {event.locked.reason === "tier" || event.locked.reason === "product" ? (
                <Link href={aboutHref} className={`${PRIMARY} mt-3 w-full`}>
                  See membership options
                </Link>
              ) : null}
            </div>
          ) : over ? (
            <div>
              <p className="text-[15px] font-semibold text-[#1a1a2e]">This event has ended.</p>
              <p className="mt-1 text-[14px] text-[#6b7280]">{event.replayVideoId ? "The replay is at the top of the page." : "No replay was added."}</p>
            </div>
          ) : (
            <div>
              <p className="flex items-center gap-2 text-[15px] font-semibold text-[#1a1a2e]" data-rsvp-state={rsvp.status ?? "none"}>
                {rsvp.status === "going" ? (
                  <>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1a1a2e] text-white">
                      <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                    </span>
                    You are going
                  </>
                ) : rsvp.status === "waitlist" ? (
                  <>
                    <Clock3 className="h-4 w-4" aria-hidden />
                    You are on the waitlist
                  </>
                ) : full ? (
                  "This event is full"
                ) : (
                  "Are you going?"
                )}
              </p>
              <p className="mt-0.5 text-[13px] tabular-nums text-[#6b7280]">
                {rsvp.status === "waitlist"
                  ? "You move up when a spot opens, and you will be told."
                  : rsvp.status === "going"
                    ? start - now > 60 * 60_000
                      ? "You will get a reminder before it starts."
                      : live
                        ? "It has started."
                        : "It starts soon."
                    : goingLabel(rsvp.going, rsvp.capacity)}
              </p>

              <div className="mt-3 flex flex-col gap-2">
                {event.meetingUrl ? (
                  <a href={event.meetingUrl} target="_blank" rel="noopener noreferrer" className={`${PRIMARY} w-full`} data-join-now>
                    <Video className="h-4 w-4" aria-hidden />
                    Join now
                  </a>
                ) : null}
                {event.livestreamUrl ? (
                  <a href={event.livestreamUrl} target="_blank" rel="noopener noreferrer" className={`${SECONDARY} w-full`}>
                    Watch the livestream
                  </a>
                ) : null}
                {rsvp.status ? (
                  <button type="button" onClick={() => void answer(false)} disabled={busy} className={`${SECONDARY} w-full`} data-rsvp="cancel">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {rsvp.status === "waitlist" ? "Leave the waitlist" : "I can't go"}
                  </button>
                ) : (
                  <button type="button" onClick={() => void answer(true)} disabled={busy} className={`${event.meetingUrl ? SECONDARY : PRIMARY} w-full`} data-rsvp="going">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {full ? "Join the waitlist" : "Going"}
                  </button>
                )}
              </div>
              {!event.meetingUrl && event.joinOpensAt ? (
                <p className="mt-2.5 text-[13px] text-[#6b7280]" data-join-opens>
                  {Date.parse(event.joinOpensAt) - now < 18 * 3_600_000 ? `The join link opens at ${clockIn(event.joinOpensAt, zone)}.` : "The join link opens here 15 minutes before the start."}
                </p>
              ) : null}
              {error ? <p className="mt-2 text-[13px] text-[#b42318]">{error}</p> : null}

              {event.attendees.length ? (
                <div className="mt-4 flex items-center gap-2.5 border-t border-[#eef0f3] pt-3.5" data-attendees>
                  <span className="flex -space-x-1">
                    {event.attendees.slice(0, 5).map((a, i) => (
                      <AppAvatar key={i} src={a.avatarUrl} name={a.name} size={28} alt={a.name} className="ring-2 ring-white" />
                    ))}
                  </span>
                  <span className="flex items-center gap-1 text-[13px] text-[#6b7280]">
                    <Users className="h-3.5 w-3.5" aria-hidden />
                    {rsvp.going} going
                  </span>
                </div>
              ) : null}

              {start > now ? (
                <div className="mt-4 border-t border-[#eef0f3] pt-3.5" data-add-to-calendar>
                  <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-[#4b5563]">
                    <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
                    Add to calendar
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <a href={event.googleUrl} target="_blank" rel="noopener noreferrer" className={cn(SECONDARY, "whitespace-nowrap px-2 text-[13px]")} data-google-calendar>
                      Google
                    </a>
                    <a href={event.icsUrl} download className={cn(SECONDARY, "whitespace-nowrap px-2 text-[13px]")} data-ics>
                      Apple, Outlook
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </aside>

        {event.description ? (
          <div className="min-w-0 lg:col-start-1 lg:row-start-2" data-event-description>
            <h2 className="mb-2 text-[15px] font-semibold text-[#1a1a2e]">About this event</h2>
            <div className="storelib-prose break-words text-[15px] leading-7 text-[#374151]" dangerouslySetInnerHTML={{ __html: event.description }} />
          </div>
        ) : null}
      </div>
    </article>
  )
}
