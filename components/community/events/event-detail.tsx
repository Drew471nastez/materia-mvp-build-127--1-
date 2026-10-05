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
 *
 * ROUND 14, A PAID EVENT. When the event carries a price, the server hands
 * over one gate answer (event.gate) and fills the private facts in only
 * when it is open. With no ticket the page reads as an invitation: what it
 * is, when, where in the world, how many are going, how many seats are
 * left, and one button, "Get a ticket", which opens the embedded Stripe
 * sheet (./ticket-checkout.tsx). With a ticket it reads as it does for a
 * free event, plus a quiet line saying what was paid and, inside the refund
 * window, Give up my seat. A free event's page is exactly as it was.
 */
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, CalendarDays, CalendarPlus, Check, Clock3, Lock, MapPin, Share2, Ticket, Users, Video } from "lucide-react"
import { Spinner } from "@/components/community/member/place-spinner"
import { MemberAvatar, warmMemberFaces } from "@/components/community/member/member-avatar"
import { CARD, PRIMARY, SECONDARY } from "@/components/library/library-ui"
import { StorelibVideo } from "@/components/video/storelib-video"
import { ConfirmDialog, type ConfirmState } from "@/components/community/member/dialogs"
import { eventTime } from "@/lib/communities/format"
import { eventPriceLabel, refundWindowOpen, seatsLeftLabel } from "@/lib/communities/event-tickets"
import type { RsvpStatus } from "@/lib/communities/types"
import { KIND_WORDS, goingLabel, isLive, isOver, whenLine, type EventDetailView } from "./model"
import { TicketCheckoutSheet } from "./ticket-checkout"
import { clockIn, useViewerZone, zoneCity } from "./use-zone"
import { STACK, STACK_FACE } from "@/components/community/member/ui"

export interface EventDetailProps {
  event: EventDetailView
  eventsHref: string
  aboutHref: string
}

/** "Oct 4", the short date the rest of the community area uses. */
const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
function shortDate(iso: string | null): string | null {
  const t = Date.parse(iso ?? "")
  return Number.isFinite(t) ? SHORT_DATE.format(t) : null
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
  const router = useRouter()
  const [rsvp, setRsvp] = useState<{ status: RsvpStatus | null; going: number; capacity: number | null }>({ status: initial.myRsvp, going: initial.goingCount, capacity: initial.capacity })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [shareNote, setShareNote] = useState<string | null>(null)

  useEffect(() => {
    if (event.host) warmMemberFaces([event.host], 40, 1)
    warmMemberFaces(event.attendees ?? [], 28, 8)
  }, [event.host, event.attendees])

  const shareEvent = async () => {
    const url = window.location.href
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: event.title, url })
        return
      }
    } catch (error) {
      if ((error as { name?: string } | null)?.name === "AbortError") return
    }
    try {
      await navigator.clipboard.writeText(url)
      setShareNote("Link copied")
    } catch {
      setShareNote("Could not copy the link")
    }
    window.setTimeout(() => setShareNote(null), 2200)
  }

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
  /* Money. A free event has no price and no ticket, so every line below is skipped. */
  const ticket = event.ticket
  const holder = ticket?.status === "paid"
  const paidLabel = ticket?.amountCents ? eventPriceLabel(ticket.amountCents, ticket.currency) : null
  const canGiveUpSeat = Boolean(ticket && refundWindowOpen({ ...event.pricing, startsAt: event.startsAt }, ticket, now) && !over && !event.cancelled)

  /* Giving up a seat: the money goes back through the same route, then the page is read again. */
  const giveUpSeat = async (reason: string): Promise<boolean> => {
    setError(null)
    const res = await fetch(`/api/community/${event.communityId}/events/${event.id}/ticket`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ reason }),
    }).catch(() => null)
    const body = (await res?.json().catch(() => ({}))) as { ok?: boolean; refundedCents?: number; message?: string; error?: string; refundPolicy?: string | null }
    if (!res?.ok || !body.ok) {
      /* Outside the window the route answers with the event's own words, which say more than any sentence here would. */
      setError(body.error === "refund_closed" ? body.refundPolicy || "It is too late to give this seat up." : body.message || "That did not work. Try again.")
      return false
    }
    await refresh()
    router.refresh()
    return true
  }

  const askToGiveUpSeat = () => {
    const back = paidLabel ? `${paidLabel} goes back to the card you paid with.` : "Your seat goes back to the community."
    setConfirm({
      title: "Give up your seat?",
      detail: `${back} Cards take 5 to 10 days to show it, and somebody else can take the seat straight away.`,
      action: "Give up my seat",
      run: giveUpSeat,
    })
  }

  return (
    <article data-event-page={event.id} className="pb-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href={eventsHref} className="inline-flex h-10 items-center gap-1.5 rounded-[10px] pr-2 text-[14px] font-medium text-[#4b5563] hover:text-[#1a1a2e]">
          <ArrowLeft className="h-4 w-4" />
          Events
        </Link>
        <button type="button" onClick={() => void shareEvent()} data-event-share="" className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#e4e7ec] bg-white px-3.5 text-[14px] font-medium text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:bg-[#f7f8fa]">
          <Share2 className="h-4 w-4" aria-hidden />
          Share
        </button>
      </div>
      {shareNote ? <p className="mb-3 text-[13px] text-[#4b5563]" data-event-share-note="">{shareNote}</p> : null}

      <div className="flex flex-col gap-6" data-event-layout="stack">
        <div className="min-w-0">
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
                <span className="block break-words text-[15px] font-semibold text-[#1a1a2e]">{event.online ? "Online" : event.location || event.locationHint || "In person"}</span>
                {!event.online ? (
                  <span className="block text-[13px] text-[#6b7280]">{event.location ? "In person" : "The exact address comes with your ticket"}</span>
                ) : event.meetingUrl ? (
                  <span className="block text-[13px] text-[#6b7280]">The link is ready</span>
                ) : event.joinOpensAt && !over ? (
                  <span className="block text-[13px] text-[#6b7280]">The link is on this page 15 minutes before the start</span>
                ) : null}
              </span>
            </li>
            {event.host ? (
              <li className="flex gap-3">
                <MemberAvatar src={event.host.avatarUrl} name={event.host.name} size={40} alt="" className="shrink-0" warm={false} />
                <span className="min-w-0 pt-0.5">
                  <span className="block truncate text-[15px] font-semibold text-[#1a1a2e]">{event.host.name}</span>
                  <span className="block text-[13px] text-[#6b7280]">Host</span>
                </span>
              </li>
            ) : null}
          </ul>
        </div>

        {/* What to do: beside the event on a computer, under its facts on a phone. */}
        <aside className={`${CARD} p-4 sm:p-5`} data-event-actions aria-label="Your answer">
          {event.cancelled ? (
            <div>
              <p className="text-[15px] font-semibold text-[#1a1a2e]">This event was cancelled.</p>
              {ticket?.status === "refunded" && paidLabel ? (
                <p className="mt-1 text-[14px] leading-6 text-[#6b7280]" data-ticket-money>
                  {paidLabel} went back{shortDate(ticket.refundedAt) ? ` on ${shortDate(ticket.refundedAt)}` : ""}. Cards take 5 to 10 days to show it.
                </p>
              ) : holder && paidLabel ? (
                <p className="mt-1 text-[14px] leading-6 text-[#6b7280]" data-ticket-money>
                  {paidLabel} is on its way back to the card you paid with. Cards take 5 to 10 days to show it.
                </p>
              ) : null}
            </div>
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
          ) : !event.gate.open ? (
            <TicketGatePanel event={event} zone={zone} joinHref={eventsHref.replace(/\/events$/, "")} now={now} />
          ) : over ? (
            <div>
              <p className="text-[15px] font-semibold text-[#1a1a2e]">This event has ended.</p>
              <p className="mt-1 text-[14px] text-[#6b7280]">
                {event.replayVideoId ? "The replay is at the top of the page." : "No replay was added."}
                {holder && paidLabel ? ` You paid ${paidLabel} for your seat.` : ""}
              </p>
            </div>
          ) : (
            <div>
              <p className="flex items-center gap-2 text-[15px] font-semibold text-[#1a1a2e]" data-rsvp-state={holder ? "going" : (rsvp.status ?? "none")}>
                {holder || rsvp.status === "going" ? (
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
              {/* A ticket holder's one quiet line about money; an invited seat never names a price. */}
              {holder ? (
                <p className="mt-0.5 text-[13px] text-[#6b7280]" data-ticket-line={ticket?.source ?? "purchase"}>
                  {ticket?.source === "purchase" && paidLabel
                    ? `Paid ${paidLabel}${shortDate(ticket.paidAt) ? ` on ${shortDate(ticket.paidAt)}` : ""}.`
                    : "You were invited to this event, with nothing to pay."}
                </p>
              ) : (
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
              )}

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
                {holder ? (
                  canGiveUpSeat ? (
                    <button type="button" onClick={askToGiveUpSeat} className={`${SECONDARY} w-full`} data-give-up-seat="">
                      Give up my seat
                    </button>
                  ) : null
                ) : rsvp.status ? (
                  <button type="button" onClick={() => void answer(false)} disabled={busy} className={`${SECONDARY} w-full`} data-rsvp="cancel">
                    {busy ? <Spinner size={16} className="text-current" /> : null}
                    {rsvp.status === "waitlist" ? "Leave the waitlist" : "I can't go"}
                  </button>
                ) : (
                  <button type="button" onClick={() => void answer(true)} disabled={busy} className={`${event.meetingUrl ? SECONDARY : PRIMARY} w-full`} data-rsvp="going">
                    {busy ? <Spinner size={16} className="text-current" /> : null}
                    {full ? "Join the waitlist" : "Going"}
                  </button>
                )}
              </div>
              {/* Outside the refund window, the policy words stand in for the button. */}
              {holder && !canGiveUpSeat && !over && event.refundPolicyText ? (
                <p className="mt-2.5 whitespace-pre-line text-[13px] leading-6 text-[#6b7280]" data-refund-policy="">
                  {event.refundPolicyText}
                </p>
              ) : null}
              {!event.meetingUrl && event.joinOpensAt ? (
                <p className="mt-2.5 text-[13px] text-[#6b7280]" data-join-opens>
                  {Date.parse(event.joinOpensAt) - now < 18 * 3_600_000 ? `The join link opens at ${clockIn(event.joinOpensAt, zone)}.` : "The join link opens here 15 minutes before the start."}
                </p>
              ) : null}
              {error ? <p className="mt-2 text-[13px] text-[#b42318]">{error}</p> : null}

              {event.attendees.length ? (
                <div className="mt-4 flex items-center gap-2.5 border-t border-[#eef0f3] pt-3.5" data-attendees>
                  <span className={STACK} data-avatar-stack="">
                    {event.attendees.slice(0, 5).map((a, i) => (
                      <MemberAvatar key={i} src={a.avatarUrl} name={a.name} size={28} alt={a.name} warm={false} className={STACK_FACE} />
                    ))}
                  </span>
                  <span className="flex items-center gap-1 text-[13px] text-[#6b7280]">
                    <Users className="h-3.5 w-3.5" aria-hidden />
                    {rsvp.going} going
                  </span>
                </div>
              ) : null}

              {start > now ? (
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#eef0f3] pt-3.5" data-add-to-calendar>
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-[#4b5563]">
                    <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
                    Add to calendar
                  </p>
                  <a href={event.googleUrl} target="_blank" rel="noopener noreferrer" className="text-[14px] font-medium text-[#1a1a2e] underline-offset-2 hover:underline" data-google-calendar>
                    Google
                  </a>
                  {event.icsUrl ? (
                    <a href={event.icsUrl} download className="text-[14px] font-medium text-[#1a1a2e] underline-offset-2 hover:underline" data-ics>
                      Apple, Outlook
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </aside>

        {event.description ? (
          <div className="min-w-0" data-event-description>
            <h2 className="mb-2 text-[15px] font-semibold text-[#1a1a2e]">About this event</h2>
            {/* With no ticket the server sends plain teaser words, not html. */}
            {event.gate.open ? (
              <div className="storelib-prose break-words text-[15px] leading-7 text-[#374151]" dangerouslySetInnerHTML={{ __html: event.description }} />
            ) : (
              <p className="break-words text-[15px] leading-7 text-[#374151]" data-event-teaser="">
                {event.description}
              </p>
            )}
          </div>
        ) : null}
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </article>
  )
}

/* ── A paid event, with no ticket yet ───────────────────────────────────── */

/**
 * What the page says when the gate is shut. Every case is a calm sentence,
 * never an error: the price and one button, or sold out, or sales closed,
 * or a refunded seat, or a visitor who has to join the community first.
 * Under it, in quiet words, what the ticket gets them.
 */
function TicketGatePanel({ event, zone, joinHref, now }: { event: EventDetailView; zone: string | undefined; joinHref: string; now: number }) {
  const [open, setOpen] = useState(false)
  const gate = event.gate
  if (gate.open) return null
  const price = event.priceCents ? eventPriceLabel(event.priceCents, event.currency) : null
  const seats = seatsLeftLabel(event.capacity, event.ticketsSold)
  const when = whenLine(event.startsAt, zone)
  const refundWords =
    event.refundPolicyText ||
    (event.pricing.refundWindowHours
      ? `Give up your seat until ${event.pricing.refundWindowHours} hours before the start and the money comes back.`
      : "Tickets for this event are not refundable.")

  if (gate.reason === "not_member") {
    return (
      <div data-ticket-gate="not_member">
        <p className="text-[15px] font-semibold text-[#1a1a2e]">{price ? `Tickets are ${price}` : "Members only"}</p>
        <p className="mt-1 text-[14px] leading-6 text-[#6b7280]">Join the community first, then the ticket is a single press.</p>
        <Link href={joinHref} className={`${PRIMARY} mt-3 w-full`} data-join-first="">
          Join the community
        </Link>
      </div>
    )
  }

  return (
    <div data-ticket-gate={gate.reason}>
      {gate.reason === "pay" ? (
        <>
          <p className="text-[15px] font-semibold text-[#1a1a2e]">
            This event costs <span className="tabular-nums">{price}</span>
          </p>
          <p className="mt-0.5 text-[13px] tabular-nums text-[#6b7280]">
            {goingLabel(event.goingCount, event.capacity)}
            {seats && seats !== "Sold out" ? ` · ${seats}` : ""}
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`${PRIMARY} mt-3 w-full`}
            data-buy-ticket={event.id}
          >
            <Ticket className="h-4 w-4" aria-hidden />
            Get a ticket · {price}
          </button>
          <TicketCheckoutSheet
            communityId={event.communityId}
            communityName={event.communityName}
            eventId={event.id}
            title={event.title}
            priceLabel={price ?? ""}
            whenLabel={when}
            open={open}
            onClose={() => setOpen(false)}
          />
        </>
      ) : gate.reason === "sold_out" ? (
        <>
          <p className="text-[15px] font-semibold text-[#1a1a2e]">Sold out</p>
          <p className="mt-1 text-[14px] leading-6 text-[#6b7280]">
            Every seat is taken. If somebody gives theirs up, tickets go back on sale here{price ? ` at ${price}` : ""}.
          </p>
        </>
      ) : gate.reason === "sales_closed" ? (
        <>
          <p className="text-[15px] font-semibold text-[#1a1a2e]">Tickets are closed</p>
          <p className="mt-1 text-[14px] leading-6 text-[#6b7280]">
            {isOver(event, now) ? "This event is over." : `Sales for this one ended. It starts ${when}.`}
          </p>
        </>
      ) : (
        <>
          <p className="text-[15px] font-semibold text-[#1a1a2e]">Your ticket was refunded</p>
          <p className="mt-1 text-[14px] leading-6 text-[#6b7280]">The seat went back to the community. You can take another one if any are left.</p>
        </>
      )}

      {/* What a ticket gets them, said once and quietly. */}
      {gate.reason === "pay" ? (
        <ul className="mt-4 space-y-1.5 border-t border-[#eef0f3] pt-3.5 text-[13px] leading-6 text-[#6b7280]" data-ticket-terms="">
          <li>A seat at this event, and the details on this page.</li>
          {event.joinOpensAt ? <li>The meeting link opens here 15 minutes before the start.</li> : <li>The exact address, and who else is coming.</li>}
          <li>{refundWords}</li>
        </ul>
      ) : null}
    </div>
  )
}
