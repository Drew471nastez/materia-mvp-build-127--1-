"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { SegmentedPills } from "@/components/app/segmented-pills"
import { Switch } from "@/components/onepage/editor-kit"
import { BookingPicker, type SlotLoader } from "@/components/forms/booking-picker"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { formsRequest } from "@/lib/forms/client"
import type { Slot } from "@/lib/forms/slots"
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar, StatusBadge, buttonAccent, buttonSecondary, card } from "../orders/order-parts"

/*
  BOOKINGS (round AR). One list in the /app frame (the pane, its bar, one
  card, as Coupons and Orders are drawn), with Upcoming and Past. Each row
  is the time, who booked and which form, and its state; a press opens the
  booking in the shared sheet on a phone and a dialog on a computer, with
  their contact details and answers, and what can be done: confirm or
  decline a request, move it (the same month and times the visitor sees,
  this booking's own time left free), or cancel it with a note for them.
  Under the list, Google Calendar: connect, which calendars block times,
  which one takes new bookings, or a plain sentence when Storelib has no
  Google client yet.

  Every read is the signed in creator's own (app/api/bookings). ?booking=<id>
  opens one, as the notification, the email and the Google event link.
*/

type Status = "pending" | "confirmed" | "declined" | "cancelled"
interface Row {
  id: string
  form_id: string
  starts_at: string
  ends_at: string
  status: Status
  visitor_timezone: string | null
  payment_status: string | null
  name: string | null
  email: string | null
  form_title: string
}
interface Detail extends Row {
  owner_timezone: string | null
  where: { label: string; text: string; url: string | null } | null
  contact: { name: string | null; email: string | null; phone: string | null }
  answers: { id: string; label: string; type: string; value: unknown }[]
  cancel_reason?: string | null
  cancelled_by?: string | null
  reschedule_count?: number | null
}
interface Google {
  configured: boolean
  connected: boolean
  needs_sql?: boolean
  email?: string | null
  needs_reconnect?: boolean
  calendars?: { id: string; name: string; primary: boolean; canWrite: boolean; color: string | null }[] | null
  busy_calendar_ids?: string[]
  write_calendar_id?: string
}

const zone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}
const dayHead = (iso: string) => new Intl.DateTimeFormat(appLocale(), { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso))
const time = (iso: string) => new Intl.DateTimeFormat(appLocale(), { hour: "numeric", minute: "2-digit" }).format(new Date(iso))
const full = (iso: string) => new Intl.DateTimeFormat(appLocale(), { dateStyle: "full", timeStyle: "short" }).format(new Date(iso))
const dayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso))
const who = (r: { name: string | null; email: string | null }) => r.name || r.email || tt("Someone")

function statusBadge(s: Status, payment?: string | null) {
  if (s === "pending" && (payment === "unpaid" || payment === "failed")) return <StatusBadge tone="attention">{tt("Waiting for payment")}</StatusBadge>
  if (s === "pending") return <StatusBadge tone="attention">{tt("Needs your answer")}</StatusBadge>
  if (s === "confirmed") return <StatusBadge tone="success">{tt("Confirmed")}</StatusBadge>
  if (s === "declined") return <StatusBadge tone="neutral">{tt("Declined")}</StatusBadge>
  return <StatusBadge tone="neutral">{tt("Cancelled")}</StatusBadge>
}

const GOOGLE_NOTICE: Record<string, () => string> = {
  connected: () => tt("Google Calendar is connected."),
  declined: () => tt("Google Calendar was not connected."),
  expired: () => tt("That took too long. Connect Google Calendar again."),
  error: () => tt("Google Calendar did not connect. Try again."),
  no_calendar: () => tt("Allow calendar access on Google's screen to connect it."),
  needs_sql: () => tt("Google Calendar needs the Bookings database update (SQL part 410)."),
  not_set_up: () => tt("Google Calendar is not set up on Storelib yet."),
}

export function BookingsClient() {
  const router = useRouter()
  const params = useSearchParams()
  const phone = usePhoneWidth()
  const [when, setWhen] = React.useState<"upcoming" | "past">("upcoming")
  const [rows, setRows] = React.useState<Record<string, Row[] | null>>({ upcoming: null, past: null })
  const [missing, setMissing] = React.useState(false)
  const [failed, setFailed] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState<string | null>(() => params.get("booking"))
  const [notice, setNotice] = React.useState<string | null>(() => {
    const g = params.get("google")
    return g && GOOGLE_NOTICE[g] ? GOOGLE_NOTICE[g]() : null
  })

  const load = React.useCallback(async (w: "upcoming" | "past") => {
    setFailed(null)
    const r = await formsRequest<{ bookings: Row[]; missing?: boolean }>(`/api/bookings?when=${w}`, { fallback: tt("Bookings could not be loaded. Try again.") })
    if (!r.data) return setFailed(r.error || tt("Bookings could not be loaded. Try again."))
    setMissing(!!r.data.missing || r.missing)
    setRows((c) => ({ ...c, [w]: r.data!.bookings }))
  }, [])
  React.useEffect(() => {
    void load("upcoming")
    void load("past")
  }, [load])

  /* The address keeps the open booking, so a reload or a shared link opens it again; never a new history entry. */
  React.useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (open) q.set("booking", open)
    else q.delete("booking")
    q.delete("google")
    const next = `/app/bookings${q.toString() ? `?${q}` : ""}`
    if (next !== window.location.pathname + window.location.search) router.replace(next, { scroll: false })
  }, [open, router])
  React.useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(t)
  }, [notice])

  const list = rows[when]
  const groups = React.useMemo(() => {
    const out: { day: string; items: Row[] }[] = []
    for (const r of list || []) {
      const d = dayOf(r.starts_at)
      const last = out[out.length - 1]
      if (last && last.day === d) last.items.push(r)
      else out.push({ day: d, items: [r] })
    }
    return out
  }, [list])
  const waiting = (rows.upcoming || []).filter((r) => r.status === "pending").length

  const patchRow = (id: string, p: Partial<Row>) => setRows((c) => ({ upcoming: c.upcoming?.map((r) => (r.id === id ? { ...r, ...p } : r)) ?? null, past: c.past?.map((r) => (r.id === id ? { ...r, ...p } : r)) ?? null }))

  return (
    <div className="orders-pane page-scroll h-full overflow-y-auto overflow-x-hidden bg-[#f8f9fa] app-page-enter" data-bookings-page="">
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Bookings")}</h1>
      </PaneBar>
      <div className={cn("mx-auto space-y-4 pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        {notice ? (
          <p role="status" className="mt-3 rounded-xl bg-[#1a1a2e] px-4 py-3 text-[14px] text-white motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200">
            {notice}
          </p>
        ) : null}
        {missing ? <p className={cn(card, "mt-3 px-4 py-3 text-[14px] text-[#6b7280]")}>{tt("Bookings need the Forms database update (SQL parts 372 and 375).")}</p> : null}
        <section aria-label={tt("Bookings")} className={cn(card, "mt-3 overflow-hidden")}>
          <div className="flex h-[52px] items-center border-b border-[#eef0f2] px-2 md:h-12">
            <SegmentedPills
              label={tt("Views")}
              size="sm"
              value={when}
              onChange={setWhen}
              options={[
                { value: "upcoming", label: waiting ? tt("Upcoming ({count} to answer)", { count: waiting }) : tt("Upcoming") },
                { value: "past", label: tt("Past") },
              ]}
            />
          </div>
          {failed ? (
            <div className="px-4 py-6 text-[14px] text-[#6b7280]">
              {failed}{" "}
              <button type="button" className="underline" onClick={() => void load(when)}>
                {tt("Try again")}
              </button>
            </div>
          ) : !list ? (
            <p className="px-4 py-6 text-[14px] text-[#6b7280]" role="status">
              {tt("Loading bookings…")}
            </p>
          ) : !list.length ? (
            <div className="px-4 py-10 text-center" data-bookings-empty="">
              <p className="text-[15px] font-semibold text-[#1a1a2e]">{when === "upcoming" ? tt("No upcoming bookings") : tt("No past bookings")}</p>
              <p className="mx-auto mt-1 max-w-[420px] text-[14px] text-[#6b7280]">{when === "upcoming" ? tt("Add a Booking block to your OnePage, or turn on bookings in a form, and new bookings show here.") : tt("Bookings show here once their time has passed.")}</p>
            </div>
          ) : (
            <div data-bookings-list="">
              {groups.map((g) => (
                <div key={g.day}>
                  <p className="sticky top-0 z-[1] border-b border-[#f1f2f4] bg-[#fafbfb]/95 px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-[#6b7280] backdrop-blur-[2px]">{dayHead(g.items[0].starts_at)}</p>
                  <ul className="divide-y divide-[#f1f2f4]">
                    {g.items.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => setOpen(r.id)}
                          data-booking-row={r.id}
                          className="flex min-h-[68px] w-full items-center gap-4 px-4 py-3 text-left outline-none transition-colors duration-100 hover:bg-[#fafafb] focus-visible:shadow-[inset_0_0_0_2px_#111113] active:bg-[#f4f5f7]"
                        >
                          <span className={cn("w-[84px] shrink-0 whitespace-nowrap text-[15px] font-semibold tabular-nums", r.status === "cancelled" || r.status === "declined" ? "text-[#9ca3af] line-through" : "text-[#1a1a2e]")}>{time(r.starts_at)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-medium text-[#1a1a2e]">{who(r)}</span>
                            <span className="block truncate text-[13px] text-[#6b7280]">
                              {r.form_title} · {tt("{minutes} min", { minutes: Math.round((Date.parse(r.ends_at) - Date.parse(r.starts_at)) / 60_000) })}
                            </span>
                          </span>
                          <span className="shrink-0">{statusBadge(r.status, r.payment_status)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
        <GoogleCard onNotice={setNotice} />
      </div>
      <BookingSheet
        id={open}
        phone={phone}
        onClose={() => setOpen(null)}
        onChanged={(id, p) => {
          patchRow(id, p)
          if (p.starts_at) void load("upcoming")
        }}
        onNotice={setNotice}
      />
    </div>
  )
}

function BookingSheet({ id, phone, onClose, onChanged, onNotice }: { id: string | null; phone: boolean; onClose: () => void; onChanged: (id: string, p: Partial<Row>) => void; onNotice: (m: string) => void }) {
  const [detail, setDetail] = React.useState<Detail | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [mode, setMode] = React.useState<"view" | "move" | "cancel">("view")
  const [busy, setBusy] = React.useState(false)
  const [reason, setReason] = React.useState("")
  const [day, setDay] = React.useState<string | null>(null)
  const [picked, setPicked] = React.useState<Slot | null>(null)
  const [version, setVersion] = React.useState(0)
  const shown = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!id) return
    shown.current = id
    setDetail(null)
    setError(null)
    setMode("view")
    setReason("")
    setDay(null)
    setPicked(null)
    formsRequest<{ booking: Detail }>(`/api/bookings/${encodeURIComponent(id)}`, { fallback: tt("This booking could not be loaded.") }).then((r) => {
      if (shown.current !== id) return
      if (r.data) setDetail(r.data.booking)
      else setError(r.error || tt("This booking could not be loaded."))
    })
  }, [id])

  const act = async (body: Record<string, unknown>, done: string) => {
    if (!detail) return
    setBusy(true)
    setError(null)
    const r = await formsRequest<{ booking: { status: Status; starts_at?: string; ends_at?: string } }>(`/api/bookings/${encodeURIComponent(detail.id)}`, { method: "PATCH", body: JSON.stringify(body), fallback: tt("The booking did not change. Try again.") })
    setBusy(false)
    if (!r.data) {
      setError(r.error || tt("The booking did not change. Try again."))
      if (body.decision === "reschedule") setVersion((n) => n + 1)
      return
    }
    const p: Partial<Row> = { status: r.data.booking.status, ...(r.data.booking.starts_at ? { starts_at: r.data.booking.starts_at, ends_at: r.data.booking.ends_at } : {}) }
    setDetail({ ...detail, ...p } as Detail)
    onChanged(detail.id, p)
    setMode("view")
    onNotice(done)
  }

  const load: SlotLoader = async (from, days) => {
    const r = await formsRequest<{ slots: Slot[]; horizon?: string }>(`/api/bookings/${encodeURIComponent(detail!.id)}/slots?from=${encodeURIComponent(from)}&days=${days}`, { fallback: tt("Times could not be loaded.") })
    if (!r.data) throw new Error(r.error || tt("Times could not be loaded."))
    return { slots: r.data.slots, horizon: r.data.horizon || null }
  }

  const d = detail
  const active = d && (d.status === "pending" || d.status === "confirmed")
  const length = d ? Math.round((Date.parse(d.ends_at) - Date.parse(d.starts_at)) / 60_000) : 0
  return (
    <SheetDialog open={!!id} onClose={onClose} phone={phone} label={d ? who(d.contact) : tt("Booking")} className="max-h-[86dvh] overflow-y-auto p-0 sm:max-w-[560px]" dialog={{ "aria-describedby": undefined }}>
      <div className="min-w-0" data-booking-sheet="">
        <div className="border-b border-[#eef0f2] px-5 pb-4 pt-5">
          <SheetDialogTitle className="truncate text-[17px] font-semibold leading-6 text-[#1a1a2e]">{d ? who(d.contact) : tt("Booking")}</SheetDialogTitle>
          {d ? (
            <p className="mt-1 text-[14px] text-[#1a1a2e]">
              <span className="font-medium">{full(d.starts_at)}</span>
              <span className="text-[#6b7280]"> · {tt("{minutes} min", { minutes: length })}</span>
            </p>
          ) : null}
          {d ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-[#6b7280]">
              {statusBadge(d.status, d.payment_status)}
              <span>{d.form_title}</span>
            </div>
          ) : null}
        </div>
        {!d ? (
          <p className="px-5 py-6 text-[14px] text-[#6b7280]" role="status">
            {error || tt("Loading…")}
          </p>
        ) : mode === "move" ? (
          <div className="space-y-3 px-5 py-4" data-booking-move="">
            <p className="text-[14px] font-medium text-[#1a1a2e]">{tt("Choose a new time")}</p>
            <BookingPicker load={load} zone={zone()} duration={length} value={picked} onPick={setPicked} day={day} onDay={setDay} version={version} />
            {error ? <p className="text-[13px] text-[#b42318]" role="alert">{error}</p> : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" className={buttonAccent} disabled={!picked || busy} onClick={() => picked && void act({ decision: "reschedule", start: picked.start }, tt("Booking moved. {name} gets an email with the new time.", { name: who(d.contact) }))}>
                {busy ? tt("Moving…") : picked ? tt("Move to {time}", { time: time(picked.start) }) : tt("Move booking")}
              </button>
              <button type="button" className={buttonSecondary} onClick={() => (setMode("view"), setError(null))}>
                {tt("Back")}
              </button>
            </div>
          </div>
        ) : mode === "cancel" ? (
          <div className="space-y-3 px-5 py-4" data-booking-cancel="">
            <p className="text-[14px] text-[#1a1a2e]">{tt("Cancel this booking? {name} gets an email, and the time is free again.", { name: who(d.contact) })}</p>
            <textarea
              className="min-h-[88px] w-full rounded-xl border border-[#e3e4e8] bg-white px-3 py-2.5 text-[15px] text-[#1a1a2e] outline-none focus:border-[#1a1a2e] focus:ring-2 focus:ring-[#1a1a2e]/10"
              maxLength={500}
              placeholder={tt("A note for them (optional)")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {error ? <p className="text-[13px] text-[#b42318]" role="alert">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={cn(buttonAccent, "bg-[#b42318] hover:bg-[#912018]")} disabled={busy} onClick={() => void act({ decision: "cancel", reason }, tt("Booking cancelled."))}>
                {busy ? tt("Cancelling…") : tt("Cancel booking")}
              </button>
              <button type="button" className={buttonSecondary} onClick={() => (setMode("view"), setError(null))}>
                {tt("Keep it")}
              </button>
            </div>
          </div>
        ) : (
          <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
            {active ? (
              <div className="flex flex-wrap gap-2 border-b border-[#eef0f2] px-5 py-4">
                {d.status === "pending" && !(d.payment_status === "unpaid" || d.payment_status === "failed") ? (
                  <>
                    <button type="button" className={buttonAccent} disabled={busy} onClick={() => void act({ decision: "confirm" }, tt("Confirmed. {name} gets an email.", { name: who(d.contact) }))}>
                      {tt("Confirm")}
                    </button>
                    <button type="button" className={buttonSecondary} disabled={busy} onClick={() => void act({ decision: "decline" }, tt("Declined. {name} gets an email.", { name: who(d.contact) }))}>
                      {tt("Decline")}
                    </button>
                  </>
                ) : null}
                <button type="button" className={buttonSecondary} disabled={busy} onClick={() => (setMode("move"), setError(null))}>
                  {tt("Move")}
                </button>
                <button type="button" className={cn(buttonSecondary, "text-[#b42318]")} disabled={busy} onClick={() => (setMode("cancel"), setError(null))}>
                  {tt("Cancel booking")}
                </button>
              </div>
            ) : null}
            {error ? <p className="px-5 pt-3 text-[13px] text-[#b42318]" role="alert">{error}</p> : null}
            <dl className="divide-y divide-[#f1f2f4] px-5" data-booking-facts="">
              {d.contact.email ? <Fact label={tt("Email")} value={<a className="underline" href={`mailto:${d.contact.email}`}>{d.contact.email}</a>} /> : null}
              {d.contact.phone ? <Fact label={tt("Phone")} value={<a className="underline" href={`tel:${d.contact.phone.replace(/[^\d+]/g, "")}`}>{d.contact.phone}</a>} /> : null}
              {d.where ? <Fact label={d.where.label} value={d.where.url && /^https:\/\//.test(d.where.url) ? <a className="break-all underline" href={d.where.url} target="_blank" rel="noopener noreferrer">{d.where.text}</a> : d.where.text} /> : null}
              {d.visitor_timezone ? <Fact label={tt("Their time zone")} value={`${d.visitor_timezone.replace(/_/g, " ")}, ${new Intl.DateTimeFormat(appLocale(), { timeZone: d.visitor_timezone, hour: "numeric", minute: "2-digit" }).format(new Date(d.starts_at))}`} /> : null}
              {d.status === "cancelled" && d.cancelled_by ? <Fact label={tt("Cancelled by")} value={d.cancelled_by === "visitor" ? who(d.contact) : tt("You")} /> : null}
              {d.cancel_reason ? <Fact label={tt("Note")} value={d.cancel_reason} /> : null}
              {d.answers
                .filter((a) => a.type !== "consent")
                .map((a) => (
                  <Fact key={a.id} label={a.label} value={answerWords(a.value)} />
                ))}
            </dl>
          </div>
        )}
      </div>
    </SheetDialog>
  )
}

function answerWords(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ") || tt("No answer")
  if (typeof v === "boolean") return v ? tt("Yes") : tt("No")
  return v === null || v === undefined || v === "" ? tt("No answer") : String(v)
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-3">
      <dt className="text-[12px] font-medium text-[#6b7280]">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-[14px] text-[#1a1a2e]">{value}</dd>
    </div>
  )
}

function GoogleCard({ onNotice }: { onNotice: (m: string) => void }) {
  const [g, setG] = React.useState<Google | null>(null)
  const [busy, setBusy] = React.useState(false)
  const read = React.useCallback(() => formsRequest<Google>("/api/google-calendar", { fallback: "" }).then((r) => setG(r.data || { configured: false, connected: false })), [])
  React.useEffect(() => {
    void read()
  }, [read])
  const save = async (patch: { busy_calendar_ids?: string[]; write_calendar_id?: string }) => {
    if (!g) return
    const before = g
    setG({ ...g, ...patch })
    const r = await formsRequest<{ ok: boolean }>("/api/google-calendar", { method: "PATCH", body: JSON.stringify({ busy_calendar_ids: g.busy_calendar_ids, write_calendar_id: g.write_calendar_id, ...patch }), fallback: tt("That was not saved. Try again.") })
    if (!r.data) {
      setG(before)
      onNotice(r.error || tt("That was not saved. Try again."))
    }
  }
  const disconnect = async () => {
    setBusy(true)
    await formsRequest("/api/google-calendar", { method: "DELETE", fallback: "" })
    setBusy(false)
    onNotice(tt("Google Calendar is disconnected."))
    void read()
  }
  return (
    <section className={cn(card, "px-4 py-4 sm:px-5")} data-google-calendar={g ? (g.configured ? (g.connected ? "connected" : "not_connected") : "not_set_up") : "checking"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[#1a1a2e]">{tt("Google Calendar")}</h2>
          <p className="mt-0.5 max-w-[560px] text-[14px] text-[#6b7280]">
            {!g
              ? tt("Checking…")
              : !g.configured
                ? tt("Google Calendar is not set up on Storelib yet. Bookings still work, and each visitor gets a calendar file in their email.")
                : g.needs_sql
                  ? tt("Google Calendar needs the Bookings database update (SQL part 410).")
                  : !g.connected
                    ? tt("Busy times in your calendar block those times on your booking forms, and each booking is added to it, with a Meet link when you choose Google Meet.")
                    : g.needs_reconnect
                      ? tt("Google stopped accepting this connection. Connect again to keep your calendar in step.")
                      : tt("Connected as {email}.", { email: g.email || tt("your Google account") })}
          </p>
        </div>
        {g?.configured && !g.needs_sql ? (
          !g.connected || g.needs_reconnect ? (
            <a href="/api/google-calendar/connect" className={buttonAccent} data-google-connect="">
              {g.needs_reconnect ? tt("Connect again") : tt("Connect Google Calendar")}
            </a>
          ) : (
            <button type="button" className={buttonSecondary} disabled={busy} onClick={() => void disconnect()}>
              {tt("Disconnect")}
            </button>
          )
        ) : null}
      </div>
      {g?.connected && g.calendars?.length ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <fieldset className="min-w-0">
            <legend className="mb-1 text-[13px] font-medium text-[#1a1a2e]">{tt("Check these for busy times")}</legend>
            <div className="divide-y divide-[#f1f2f4]">
              {g.calendars.map((c) => {
                const on = (g.busy_calendar_ids || []).includes(c.id) || (c.primary && (g.busy_calendar_ids || []).includes("primary"))
                return (
                  <div key={c.id} className="flex min-h-11 items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-[14px] text-[#1a1a2e]">
                      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color || "#9ca3af" }} />
                      <span className="truncate">{c.name}</span>
                    </span>
                    <Switch
                      checked={on}
                      label={c.name}
                      onChange={(yes) => {
                        const ids = (g.busy_calendar_ids || []).filter((x) => x !== c.id && !(c.primary && x === "primary"))
                        void save({ busy_calendar_ids: yes ? [...ids, c.id] : ids })
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </fieldset>
          <fieldset className="min-w-0">
            <legend className="mb-1 text-[13px] font-medium text-[#1a1a2e]">{tt("Add new bookings to")}</legend>
            <div className="divide-y divide-[#f1f2f4]" role="radiogroup">
              {g.calendars
                .filter((c) => c.canWrite)
                .map((c) => {
                  const on = g.write_calendar_id === c.id || (c.primary && g.write_calendar_id === "primary")
                  return (
                    <label key={c.id} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-[14px] text-[#1a1a2e]">
                      <span className="truncate">{c.name}</span>
                      <input type="radio" name="gcal-write" className="h-4 w-4 accent-[#1a1a2e]" checked={on} onChange={() => void save({ write_calendar_id: c.id })} />
                    </label>
                  )
                })}
            </div>
          </fieldset>
        </div>
      ) : null}
    </section>
  )
}
