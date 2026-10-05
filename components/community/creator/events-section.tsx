"use client"

/**
 * ===========================================================================
 *  EVENTS
 * ===========================================================================
 * Calls, workshops, Q&As and meetups. The creator types the date and times
 * in the event's own time zone (their own, picked for them); the server
 * stores instants, so every member sees the time in theirs. A meeting link
 * is only handed to members who may attend, from shortly before it starts
 * (the member side's rule). Edit, cancel (and undo it), and after the event
 * attach the replay: a Storelib video id, or a link with one in it.
 *
 * Round 14: an event can carry a price. The Tickets part of the editor is
 * only there for somebody with price_events, and only once run-now part 105
 * has run; the Tickets panel beside each event (./event-tickets.tsx) shows
 * who holds one, what they paid and whether they turned up. Cancelling a
 * paid event asks whether everybody should have their money back.
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatusBadge } from "@/app/app/orders/order-parts"
import { eventDateBadge, eventTime } from "@/lib/communities/format"
import type { AccessRuleJson, EventKind } from "@/lib/communities/types"
import { eventPriceLabel } from "@/lib/communities/event-tickets"
import type { ActionMenuItem } from "@/components/ui/responsive-action-menu"
import type { CommunityHead, EventEditView, EventTicketSetup, RuleOptions } from "./view-types"
import { EVENT_KIND_LABEL, checkEvent, checkEventTickets, refundWindowWords, utcToZonedParts } from "./logic"
import { EventTicketsPanel } from "./event-tickets"
import { AccessEditor } from "./access-editor"
import { uploadCommunityVideo } from "@/lib/video/upload-client"
import { Dialog, Empty, FilterTabs, ListCard, Notice, PicturePick, RowMenu, Toggle, buttonPrimary, buttonSecondary, errorText, field, label, selectField, send, useToast } from "./parts"

interface Draft {
  id: string | null
  title: string
  description: string
  kind: EventKind
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  timezone: string
  location: string
  meetingUrl: string
  livestreamUrl: string
  capacity: string
  coverUrl: string | null
  access: AccessRuleJson
  replay: string
  past: boolean
  /* ── Tickets (round 14) ── */
  priceMode: "free" | "paid"
  price: string
  salesCloseDate: string
  salesCloseTime: string
  refundWindow: string
  refundPolicy: string
}

function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

function zones(current: string): string[] {
  let list: string[] = []
  try {
    list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? []
  } catch {
    list = []
  }
  if (!list.length) list = ["UTC", "Europe/London", "Europe/Berlin", "Europe/Bucharest", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Asia/Tokyo", "Australia/Sydney"]
  return list.includes(current) ? list : [current, ...list]
}

function blankDraft(): Draft {
  const zone = browserZone()
  const start = new Date(Date.now() + 7 * 86_400_000)
  start.setMinutes(0, 0, 0)
  start.setHours(18)
  const parts = utcToZonedParts(start.toISOString(), zone)
  return { id: null, title: "", description: "", kind: "online", startDate: parts.date, startTime: "18:00", endDate: parts.date, endTime: "19:00", timezone: zone, location: "", meetingUrl: "", livestreamUrl: "", capacity: "", coverUrl: null, access: {}, replay: "", past: false, priceMode: "free", price: "", salesCloseDate: "", salesCloseTime: "", refundWindow: "", refundPolicy: "" }
}

/** A price in cents as it is typed back into the field: 2500 reads 25, 2550 reads 25.50. */
function typedPrice(cents: number | null): string {
  if (!cents || cents <= 0) return ""
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2)
}

function draftOf(e: EventEditView): Draft {
  const s = utcToZonedParts(e.startsAt, e.timezone)
  const en = utcToZonedParts(e.endsAt, e.timezone)
  const close = e.salesCloseAt ? utcToZonedParts(e.salesCloseAt, e.timezone) : { date: "", time: "" }
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    kind: e.kind,
    startDate: s.date,
    startTime: s.time,
    endDate: en.date || s.date,
    endTime: en.time,
    timezone: e.timezone,
    location: e.location ?? "",
    meetingUrl: e.meetingUrl ?? "",
    livestreamUrl: e.livestreamUrl ?? "",
    capacity: e.capacity ? String(e.capacity) : "",
    coverUrl: e.coverUrl,
    access: e.access,
    replay: e.replayVideoId ?? "",
    past: Date.parse(e.startsAt) < Date.now(),
    priceMode: e.priceCents && e.priceCents > 0 ? "paid" : "free",
    price: typedPrice(e.priceCents),
    salesCloseDate: close.date,
    salesCloseTime: close.time,
    refundWindow: e.refundWindowHours === null ? "" : String(e.refundWindowHours),
    refundPolicy: e.refundPolicy ?? "",
  }
}

type EventsData = { upcoming: EventEditView[]; past: EventEditView[]; tickets: EventTicketSetup }

export function EventsSection({ head, initial, options, openNew }: { head: CommunityHead; initial: EventsData; options: RuleOptions; openNew: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const base = `/api/app/community/${head.id}/events`
  const [data, setData] = React.useState<EventsData>(initial)
  const [view, setView] = React.useState<"upcoming" | "past">("upcoming")
  const [draft, setDraft] = React.useState<Draft | null>(openNew ? blankDraft() : null)
  const [cancelling, setCancelling] = React.useState<EventEditView | null>(null)
  const [refundAll, setRefundAll] = React.useState(true)
  const [panelFor, setPanelFor] = React.useState<EventEditView | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<{ text: string; field?: string } | null>(null)
  const zoneList = React.useMemo(() => zones(draft?.timezone ?? browserZone()), [draft?.timezone])
  const tickets = data.tickets
  const mayPrice = head.can.price_events === true

  const reload = async () => {
    const res = await send<EventsData>(base, "GET")
    if (res.ok) setData({ upcoming: res.data.upcoming ?? [], past: res.data.past ?? [], tickets: res.data.tickets ?? tickets })
  }

  const save = async () => {
    if (!draft) return
    const checked = checkEvent(draft)
    if (!checked.ok) return setError({ text: checked.error, field: checked.field })
    const priced = mayPrice && tickets.ready
    if (priced) {
      const money = checkEventTickets(draft, { startsAt: checked.value.startsAt, timezone: checked.value.timezone })
      if (!money.ok) return setError({ text: money.error, field: money.field })
    }
    setBusy(true)
    setError(null)
    const body = { ...draft, replay: draft.id ? draft.replay : undefined, priceMode: priced ? draft.priceMode : undefined }
    const res = draft.id ? await send(`${base}/${draft.id}`, "PATCH", body) : await send(base, "POST", body)
    setBusy(false)
    if (!res.ok) return setError({ text: errorText(res.data.error, "The event could not be saved."), field: res.data.field })
    setDraft(null)
    toast(draft.id ? "Event saved" : "Event scheduled")
    await reload()
    router.refresh()
  }

  const setStatus = async (e: EventEditView, status: "cancelled" | "scheduled", refund = false) => {
    setBusy(true)
    const res = await send<{ refunded?: number; failed?: number }>(`${base}/${e.id}`, "PATCH", { status, refundAll: refund || undefined })
    setBusy(false)
    if (!res.ok) return toast(errorText(res.data.error))
    setCancelling(null)
    const back = res.data.refunded ?? 0
    const failed = res.data.failed ?? 0
    toast(status === "cancelled" ? (back > 0 ? `Cancelled. ${back} ${back === 1 ? "ticket" : "tickets"} refunded${failed > 0 ? `, ${failed} did not go back` : ""}` : "Event cancelled") : "Event back on")
    await reload()
  }

  const menu = (e: EventEditView): ActionMenuItem[] => {
    const items: ActionMenuItem[] = [
      { label: Date.parse(e.startsAt) < Date.now() ? "Edit or add the replay" : "Edit", onClick: () => { setError(null); setDraft(draftOf(e)) } },
      { label: "Open event page", href: `/community/${head.slug}/events/${e.id}`, target: "_blank" },
    ]
    if (tickets.ready && ((e.priceCents ?? 0) > 0 || e.ticketsSold > 0)) items.push({ label: "Tickets", onClick: () => setPanelFor(e) })
    if (e.status === "scheduled" && Date.parse(e.startsAt) > Date.now()) items.push({ label: "Cancel event", variant: "destructive", onClick: () => { setRefundAll(true); setCancelling(e) }, separatorBefore: true })
    if (e.status === "cancelled") items.push({ label: "Put it back on", onClick: () => void setStatus(e, "scheduled"), separatorBefore: true })
    return items
  }

  const mayRefund = head.can.refund_tickets === true
  const liveTickets = cancelling?.money ? cancelling.money.sold + cancelling.money.invited : 0

  /** How many tickets this event has sold, for the editor's heading. */
  const soldFor = (id: string): number => [...data.upcoming, ...data.past].find((e) => e.id === id)?.ticketsSold ?? 0

  /** The money line under an event in the list: what it sold, and what that came to. */
  const moneyLine = (e: EventEditView): string | null => {
    if (!tickets.ready) return null
    const m = e.money
    if (!m || (m.sold === 0 && m.invited === 0)) return (e.priceCents ?? 0) > 0 ? `${eventPriceLabel(e.priceCents as number, e.currency)} a ticket · none sold yet` : null
    const parts = [`${m.sold} ${m.sold === 1 ? "ticket" : "tickets"}`, eventPriceLabel(m.grossCents, m.currency)]
    if (m.invited > 0) parts.push(`${m.invited} free`)
    if (m.refundedCents > 0) parts.push(`${eventPriceLabel(m.refundedCents, m.currency)} refunded`)
    return parts.join(" · ")
  }

  if (panelFor)
    return (
      <EventTicketsPanel
        head={head}
        event={panelFor}
        currency={tickets.currency}
        onBack={() => {
          setPanelFor(null)
          void reload()
        }}
      />
    )

  const list = view === "upcoming" ? data.upcoming : data.past
  const bad = (f: string) => error?.field === f
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d))

  return (
    <div className="space-y-4" data-events="">
      <ListCard
        head={<FilterTabs label="Which events" value={view} onChange={setView} tabs={[{ value: "upcoming", label: "Upcoming", count: data.upcoming.length }, { value: "past", label: "Past", count: data.past.length }]} />}
        actions={
          <button type="button" onClick={() => { setError(null); setDraft(blankDraft()) }} className={buttonPrimary} data-event-new="">
            <Plus aria-hidden className="h-4 w-4" />
            Schedule
          </button>
        }
      >
        {list.length === 0 ? (
          view === "upcoming" ? (
            <Empty title="No events scheduled." detail="A call, a workshop or a Q&A. Members get a reminder before it starts.">
              <button type="button" onClick={() => setDraft(blankDraft())} className={cn(buttonPrimary, "h-10 px-4")}>
                Schedule an event
              </button>
            </Empty>
          ) : (
            <Empty title="No past events." />
          )
        ) : (
          <ul className="divide-y divide-[#f1f2f4]">
            {list.map((e) => {
              const d = eventDateBadge(e.startsAt)
              const money = moneyLine(e)
              return (
                <li key={e.id} className="flex min-h-[72px] items-center gap-3 px-4 py-3 sm:px-5" data-event-row="">
                  <span aria-hidden className={cn("grid h-12 w-12 shrink-0 place-content-center rounded-xl border border-[#e5e7eb] text-center leading-none", e.status === "cancelled" && "opacity-50")}>
                    <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[#b42318]">{d.month}</span>
                    <span className="mt-0.5 text-[17px] font-semibold tabular-nums text-[#1a1a2e]">{d.day}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-2">
                      <span className={cn("truncate text-[14.5px] font-medium", e.status === "cancelled" ? "text-[#9ca3af] line-through" : "text-[#1a1a2e]")}>{e.title}</span>
                      {e.status === "cancelled" ? <StatusBadge tone="neutral">Cancelled</StatusBadge> : null}
                      {view === "past" && e.replayVideoId ? <StatusBadge tone="success">Replay</StatusBadge> : null}
                    </p>
                    <p className="line-clamp-2 text-[12.5px] text-[#6b7280] sm:truncate">{[eventTime(e.startsAt, e.endsAt), EVENT_KIND_LABEL[e.kind], `${e.goingCount}${e.capacity ? ` of ${e.capacity}` : ""} going`].join(" · ")}</p>
                    {money ? (
                      <p className="mt-0.5 truncate text-[12.5px] tabular-nums text-[#4b5563]" data-event-money="">
                        {money}
                      </p>
                    ) : null}
                  </div>
                  <RowMenu items={menu(e)} label={`Actions for ${e.title}`} />
                </li>
              )
            })}
          </ul>
        )}
      </ListCard>

      <Dialog
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit event" : "Schedule an event"}
        wide
        footer={
          <>
            <button type="button" onClick={() => setDraft(null)} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
              Cancel
            </button>
            <button type="button" onClick={() => void save()} disabled={busy} className={cn(buttonPrimary, "h-10 px-4 sm:h-9")} data-event-save="">
              {busy ? "Saving" : draft?.id ? "Save" : "Schedule"}
            </button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-4" data-event-editor="">
            <div>
              <label htmlFor="ev-title" className={label}>
                Title
              </label>
              <input id="ev-title" value={draft.title} onChange={(e) => set("title", e.target.value.slice(0, 140))} placeholder="Monthly Q&A" aria-invalid={bad("title") || undefined} className={cn(field, "h-11 sm:h-10", bad("title") && "border-[#dc2626]")} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr]">
              <div>
                <label htmlFor="ev-kind" className={label}>
                  Kind
                </label>
                <select id="ev-kind" value={draft.kind} onChange={(e) => set("kind", e.target.value as EventKind)} className={selectField}>
                  {(["online", "live", "workshop", "ama", "meetup", "in_person"] as const).map((k) => (
                    <option key={k} value={k}>
                      {EVENT_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ev-zone" className={label}>
                  Time zone
                </label>
                <select id="ev-zone" value={draft.timezone} onChange={(e) => set("timezone", e.target.value)} className={selectField}>
                  {zoneList.map((z) => (
                    <option key={z} value={z}>
                      {z.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1.3fr_1fr_1fr]">
              <div className="col-span-2 sm:col-span-1">
                <label htmlFor="ev-date" className={label}>
                  Date
                </label>
                <input id="ev-date" type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value, endDate: e.target.value })} aria-invalid={bad("start") || undefined} className={cn(field, "h-11 sm:h-10", bad("start") && "border-[#dc2626]")} />
              </div>
              <div>
                <label htmlFor="ev-start" className={label}>
                  Starts
                </label>
                <input id="ev-start" type="time" value={draft.startTime} onChange={(e) => set("startTime", e.target.value)} className={cn(field, "h-11 sm:h-10", bad("start") && "border-[#dc2626]")} />
              </div>
              <div>
                <label htmlFor="ev-end" className={label}>
                  Ends
                </label>
                <input id="ev-end" type="time" value={draft.endTime} onChange={(e) => set("endTime", e.target.value)} aria-invalid={bad("end") || undefined} className={cn(field, "h-11 sm:h-10", bad("end") && "border-[#dc2626]")} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="ev-meeting" className={label}>
                  {draft.kind === "in_person" || draft.kind === "meetup" ? "Link (optional)" : "Meeting link"}
                </label>
                <input id="ev-meeting" inputMode="url" value={draft.meetingUrl} onChange={(e) => set("meetingUrl", e.target.value.trim().slice(0, 1000))} placeholder="https://zoom.us/j/..." aria-invalid={bad("meetingUrl") || undefined} className={cn(field, "h-11 sm:h-10", bad("meetingUrl") && "border-[#dc2626]")} />
              </div>
              <div>
                <label htmlFor="ev-location" className={label}>
                  Place
                </label>
                <input id="ev-location" value={draft.location} onChange={(e) => set("location", e.target.value.slice(0, 300))} placeholder={draft.kind === "in_person" || draft.kind === "meetup" ? "Address" : "Optional"} className={cn(field, "h-11 sm:h-10")} />
              </div>
            </div>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div>
                <label htmlFor="ev-live" className={label}>
                  Livestream link
                </label>
                <input id="ev-live" inputMode="url" value={draft.livestreamUrl} onChange={(e) => set("livestreamUrl", e.target.value.trim().slice(0, 1000))} placeholder="Optional" aria-invalid={bad("livestreamUrl") || undefined} className={cn(field, "h-11 sm:h-10", bad("livestreamUrl") && "border-[#dc2626]")} />
              </div>
              <div>
                <label htmlFor="ev-cap" className={label}>
                  {draft.priceMode === "paid" ? "Seats" : "Capacity"}
                </label>
                <input id="ev-cap" inputMode="numeric" value={draft.capacity} onChange={(e) => set("capacity", e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="No limit" aria-invalid={bad("capacity") || undefined} className={cn(field, "h-11 tabular-nums sm:h-10")} />
              </div>
            </div>
            <div>
              <label htmlFor="ev-desc" className={label}>
                About it
              </label>
              <textarea id="ev-desc" value={draft.description} onChange={(e) => set("description", e.target.value.slice(0, 4000))} rows={3} placeholder="What you will cover and who it is for" className={cn(field, "resize-y py-2.5 leading-relaxed")} />
            </div>
            <div>
              <p className={label}>Cover</p>
              <PicturePick value={draft.coverUrl} onChange={(v) => set("coverUrl", v)} shape="wide" name="cover" onError={(m) => setError({ text: m })} />
            </div>
            <AccessEditor value={draft.access} onChange={(v) => set("access", v)} options={options} idPrefix="ev" />
            {mayPrice ? (
              <div className="border-t border-[#e5e7eb]/60 pt-4" data-tickets-card="">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[15px] font-semibold text-[#1a1a2e]">Tickets</h3>
                  {draft.id && soldFor(draft.id) > 0 ? <span className="shrink-0 text-[12.5px] tabular-nums text-[#6b7280]">{soldFor(draft.id)} sold</span> : null}
                </div>
                {!tickets.ready ? (
                  <p className="mt-1.5 text-[13px] leading-5 text-[#6b7280]" data-tickets-missing="">
                    Paid events need the database update, run-now part 105. Until it runs every event is free. Only you and your team see this line.
                  </p>
                ) : (
                  <>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <TicketMode value={draft.priceMode} onChange={(v) => set("priceMode", v)} paidOff={!tickets.canSell} />
                      {draft.priceMode === "free" ? <p className="text-[13px] text-[#6b7280]">Free for everyone who can see it.</p> : null}
                    </div>
                    {!tickets.canSell ? (
                      <p className="mt-2 rounded-xl border border-[#f1e3bd] bg-[#fdf8ea] px-3.5 py-2.5 text-[13px] leading-5 text-[#6b4e00]" data-payouts-off="">
                        Payouts are not set up yet, so a ticket cannot be sold.{" "}
                        <Link href="/app/settings?tab=payments" className="font-medium underline underline-offset-2">
                          Set up payouts
                        </Link>
                      </p>
                    ) : null}
                    {draft.priceMode === "paid" ? (
                      <div className="mt-3 space-y-3.5">
                        <div>
                          <label htmlFor="ev-price" className={label}>
                            Price a ticket
                          </label>
                          <div className="relative max-w-[220px]">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13.5px] font-medium uppercase text-[#6b7280]">{tickets.currency}</span>
                            <input
                              id="ev-price"
                              inputMode="decimal"
                              value={draft.price}
                              onChange={(e) => set("price", e.target.value.replace(/[^\d.,]/g, "").slice(0, 10))}
                              placeholder="25"
                              aria-invalid={bad("price") || undefined}
                              className={cn(field, "h-11 pl-12 tabular-nums sm:h-10", bad("price") && "border-[#dc2626]")}
                            />
                          </div>
                          <p className="mt-1.5 text-[12.5px] leading-snug text-[#6b7280]">
                            Members pay once, in a checkout inside the community. The meeting link, the address and who else is going open when they have a ticket.
                            {draft.capacity ? ` ${draft.capacity} seats.` : " No seat limit: add a capacity above to sell a set number."}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_120px]">
                          <div>
                            <label htmlFor="ev-close-date" className={label}>
                              Sales close
                            </label>
                            <input
                              id="ev-close-date"
                              type="date"
                              value={draft.salesCloseDate}
                              onChange={(e) => setDraft({ ...draft, salesCloseDate: e.target.value, salesCloseTime: draft.salesCloseTime || draft.startTime })}
                              aria-invalid={bad("salesClose") || undefined}
                              className={cn(field, "h-11 sm:h-10", bad("salesClose") && "border-[#dc2626]")}
                            />
                          </div>
                          <div>
                            <label htmlFor="ev-close-time" className={label}>
                              At
                            </label>
                            <input id="ev-close-time" type="time" value={draft.salesCloseTime} onChange={(e) => set("salesCloseTime", e.target.value)} className={cn(field, "h-11 sm:h-10", bad("salesClose") && "border-[#dc2626]")} />
                          </div>
                          <div>
                            <label htmlFor="ev-refund-window" className={label}>
                              Refunds up to
                            </label>
                            <input
                              id="ev-refund-window"
                              inputMode="numeric"
                              value={draft.refundWindow}
                              onChange={(e) => set("refundWindow", e.target.value.replace(/\D/g, "").slice(0, 4))}
                              placeholder="None"
                              aria-invalid={bad("refundWindow") || undefined}
                              className={cn(field, "h-11 tabular-nums sm:h-10", bad("refundWindow") && "border-[#dc2626]")}
                            />
                          </div>
                        </div>
                        <p className="text-[12.5px] leading-snug text-[#6b7280]">
                          {draft.salesCloseDate ? "Nobody can buy a ticket after that." : "Leave the date empty and sales stop when the event starts."}{" "}
                          {draft.refundWindow ? `A holder can give up their seat and get their money back ${refundWindowWords(Number(draft.refundWindow))}.` : "Hours before the start when a holder can still refund themselves. Empty means only you can refund them."}
                        </p>
                        <div>
                          <label htmlFor="ev-refund-policy" className={label}>
                            Refund policy for this event
                          </label>
                          <textarea
                            id="ev-refund-policy"
                            value={draft.refundPolicy}
                            onChange={(e) => set("refundPolicy", e.target.value.slice(0, 2000))}
                            rows={3}
                            placeholder={tickets.communityPolicy ? "Leave it empty to use the community's policy" : "What happens if somebody cannot come"}
                            className={cn(field, "resize-y py-2.5 leading-relaxed")}
                          />
                          <p className="mt-1.5 text-[12.5px] leading-snug text-[#6b7280]">
                            {draft.refundPolicy.trim()
                              ? "Buyers see these words on the event page and in their receipt."
                              : tickets.communityPolicy
                                ? `Empty, so buyers see the community's policy: ${tickets.communityPolicy.slice(0, 140)}${tickets.communityPolicy.length > 140 ? "..." : ""}`
                                : "Empty, and the community has no policy either, so buyers are told to ask you."}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
            {draft.id ? (
              <div>
                <label htmlFor="ev-replay" className={label}>
                  Replay
                </label>
                <ReplayUpload communityId={head.id} onDone={(id) => set("replay", id)} onError={(m) => setError({ text: m, field: "replay" })} />
                <input id="ev-replay" value={draft.replay} onChange={(e) => set("replay", e.target.value.trim().slice(0, 300))} placeholder="Or paste a Storelib video id" aria-invalid={bad("replay") || undefined} className={cn(field, "mt-2 h-11 font-mono text-[13px] sm:h-10", bad("replay") && "border-[#dc2626]")} />
                <p className="mt-1 text-[12.5px] text-[#6b7280]">Members who could attend can watch it on the event page afterwards.</p>
              </div>
            ) : null}
            {error ? <Notice>{error.text}</Notice> : null}
          </div>
        ) : null}
      </Dialog>

      {/* CANCELLING. With live tickets it asks plainly whether everybody should have their money back, and says how much. */}
      <Dialog
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title={`Cancel ${cancelling?.title ?? "this event"}?`}
        footer={
          <>
            <button type="button" onClick={() => setCancelling(null)} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
              Keep it on
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => cancelling && void setStatus(cancelling, "cancelled", liveTickets > 0 && mayRefund && refundAll)}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-[#b42318] px-4 text-[13px] font-medium text-white hover:bg-[#9a1d14] disabled:opacity-50 sm:h-9"
              data-cancel-confirm=""
            >
              {busy ? "Working" : liveTickets > 0 && mayRefund && refundAll ? "Cancel and refund" : "Cancel event"}
            </button>
          </>
        }
      >
        <p className="text-[14px] leading-relaxed text-[#4b5563]">It shows as cancelled to members, and anyone going hears about it. You can put it back on.</p>
        {liveTickets > 0 ? (
          <div className="mt-3" data-cancel-refund="">
            {mayRefund ? (
              <>
                <Toggle
                  id="cancel-refund-all"
                  checked={refundAll}
                  onChange={setRefundAll}
                  title="Refund everybody"
                  hint={`${liveTickets} ${liveTickets === 1 ? "person holds a ticket" : "people hold tickets"}, ${eventPriceLabel(cancelling?.money?.grossCents ?? 0, cancelling?.money?.currency ?? null)} in all. A card takes 5 to 10 days to show it.`}
                />
                {!refundAll ? <p className="mt-2 text-[13px] leading-5 text-[#b42318]">Nobody gets their money back. You can refund them one at a time in Tickets.</p> : null}
              </>
            ) : (
              <p className="rounded-xl border border-[#f1e3bd] bg-[#fdf8ea] px-3.5 py-2.5 text-[13px] leading-5 text-[#6b4e00]">
                {liveTickets} {liveTickets === 1 ? "person holds a ticket" : "people hold tickets"}. Your role cannot give money back, so ask the owner to refund them.
              </p>
            )}
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}

/** Uploads a replay through the community video route (W4's provider pipeline) and hands back its id. */
function ReplayUpload({ communityId, onDone, onError }: { communityId: string; onDone: (videoId: string) => void; onError: (message: string) => void }) {
  const input = React.useRef<HTMLInputElement>(null)
  const [progress, setProgress] = React.useState<number | null>(null)
  const upload = async (file: File | undefined) => {
    if (!file) return
    setProgress(0)
    try {
      const video = await uploadCommunityVideo({ endpoint: `/api/app/community/${communityId}/videos`, file, onProgress: setProgress })
      onDone(video.id)
    } catch (e) {
      onError((e as { message?: string })?.message || "The video did not upload. Try again.")
    } finally {
      setProgress(null)
    }
  }
  return (
    <div className="flex items-center gap-2">
      <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = "" }} />
      <button type="button" disabled={progress !== null} onClick={() => input.current?.click()} className={buttonSecondary} data-replay-upload="">
        {progress !== null ? `Uploading ${progress}%` : "Upload the replay"}
      </button>
    </div>
  )
}

/**
 * FREE OR PAID, as two plain choices. Paid is off while payouts are not
 * connected, because a price nobody could pay is worse than no price: the
 * line under it says why and where to fix it.
 */
function TicketMode({ value, onChange, paidOff }: { value: "free" | "paid"; onChange: (v: "free" | "paid") => void; paidOff: boolean }) {
  return (
    <div role="radiogroup" aria-label="Tickets" className="inline-flex rounded-[10px] bg-[#eef0f2] p-0.5" data-ticket-mode={value}>
      {(["free", "paid"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          disabled={v === "paid" && paidOff}
          onClick={() => onChange(v)}
          data-ticket-choice={v}
          className={cn(
            "inline-flex h-10 min-w-[84px] items-center justify-center rounded-[8px] px-3 text-[13.5px] font-medium transition-colors duration-100 sm:h-9",
            value === v ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08),0_0_0_0.5px_rgba(16,24,40,0.06)]" : "text-[#4b5563] hover:text-[#1a1a2e]",
            v === "paid" && paidOff && "cursor-default text-[#9ca3af] hover:text-[#9ca3af]",
          )}
        >
          {v === "free" ? "Free" : "Paid"}
        </button>
      ))}
    </div>
  )
}
