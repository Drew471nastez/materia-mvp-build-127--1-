"use client"

import * as React from "react"
import { BookingPicker, type SlotLoader } from "@/components/forms/booking-picker"
import { formsRequest } from "@/lib/forms/client"
import type { Slot } from "@/lib/forms/slots"

/*
  THE VISITOR'S BOOKING (round AR): what they booked, and Change time or
  Cancel. Changing shows the same month and times as the booking sheet
  (components/forms/booking-picker), with their own time left free; the
  server checks the new time again and answers 409 if someone was quicker,
  and the times are read again. Every step is this page's own state, so
  Back never reloads anything. Plain words, the visitor's own time zone.
*/

interface Booking {
  title: string
  starts_at: string
  ends_at: string
  duration: number
  status: "pending" | "confirmed" | "declined" | "cancelled"
  cancelled_by: string | null
  where: { label: string; text: string; url: string | null } | null
  can_change: boolean
  name: string | null
  google_add_url: string | null
}

const zone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}
const full = (iso: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(new Date(iso))
const button = "inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-[15px] font-semibold outline-none transition-[background-color,transform] duration-100 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 active:scale-[0.98] disabled:opacity-50"
const primary = `${button} bg-[#1a1a2e] text-white hover:bg-[#2a2a40]`
const secondary = `${button} border border-[#e3e4e8] bg-white text-[#1a1a2e] hover:border-[#c9cbd1]`

export function ManageBooking({ token }: { token: string }) {
  const [b, setB] = React.useState<Booking | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [mode, setMode] = React.useState<"view" | "move" | "cancel">("view")
  const [day, setDay] = React.useState<string | null>(null)
  const [picked, setPicked] = React.useState<Slot | null>(null)
  const [version, setVersion] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const [reason, setReason] = React.useState("")
  const [done, setDone] = React.useState<string | null>(null)
  const base = `/api/bookings/manage/${encodeURIComponent(token)}`

  const read = React.useCallback(async () => {
    const r = await formsRequest<{ booking: Booking }>(base, { fallback: "This booking could not be loaded. Try again." })
    if (r.data) setB(r.data.booking)
    else setError(r.error || "This booking could not be loaded. Try again.")
  }, [base])
  React.useEffect(() => {
    void read()
  }, [read])

  const load: SlotLoader = async (from, days) => {
    const r = await formsRequest<{ slots: Slot[]; horizon?: string }>(`${base}?slots=1&from=${encodeURIComponent(from)}&days=${days}`, { fallback: "Times could not be loaded." })
    if (!r.data) throw new Error(r.error || "Times could not be loaded.")
    return { slots: r.data.slots, horizon: r.data.horizon || null }
  }

  const send = async (body: Record<string, unknown>, word: string) => {
    setBusy(true)
    setError(null)
    const r = await formsRequest<{ booking: { status: Booking["status"]; starts_at: string; ends_at: string } }>(base, { method: "POST", body: JSON.stringify(body), fallback: "That did not work. Try again." })
    setBusy(false)
    if (!r.data) {
      setError(r.error || "That did not work. Try again.")
      if (body.action === "reschedule") {
        setPicked(null)
        setVersion((n) => n + 1)
      }
      return
    }
    setMode("view")
    setDone(word)
    await read()
  }

  if (!b)
    return (
      <section className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p className="text-[15px] text-[#6b7280]" role="status">
          {error || "Loading your booking…"}
        </p>
      </section>
    )

  const off = b.status === "cancelled" || b.status === "declined"
  return (
    <section className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6" data-manage-booking={b.status}>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]">{off ? "Cancelled" : b.status === "pending" ? "Requested" : "Booked"}</p>
      <h1 className="mt-1 text-[22px] font-bold leading-tight text-[#1a1a2e]">{b.title}</h1>
      <p className={`mt-2 text-[16px] ${off ? "text-[#9ca3af] line-through" : "font-medium text-[#1a1a2e]"}`}>{full(b.starts_at)}</p>
      <p className="mt-0.5 text-[14px] text-[#6b7280]">
        {b.duration} min · {zone().replace(/_/g, " ")}
      </p>
      {b.where && !off ? (
        <p className="mt-3 text-[14px] text-[#1a1a2e]">
          {b.where.label}:{" "}
          {b.where.url && /^https:\/\//.test(b.where.url) ? (
            <a className="break-all underline" href={b.where.url} target="_blank" rel="noopener noreferrer">
              {b.where.text}
            </a>
          ) : (
            b.where.text
          )}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="mt-4 rounded-xl bg-[#f3f4f6] px-3 py-2.5 text-[14px] text-[#1a1a2e] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
          {done}
        </p>
      ) : null}

      {mode === "move" ? (
        <div className="mt-5 space-y-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200" data-manage-move="">
          <BookingPicker load={load} zone={zone()} duration={b.duration} value={picked} onPick={setPicked} day={day} onDay={setDay} version={version} />
          {error ? <p className="text-[14px] text-[#b42318]" role="alert">{error}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className={primary} disabled={!picked || busy} onClick={() => picked && void send({ action: "reschedule", start: picked.start }, "Your booking has its new time. An email with it is on its way.")}>
              {busy ? "Saving…" : picked ? `Move to ${full(picked.start)}` : "Choose a time"}
            </button>
            <button type="button" className={secondary} onClick={() => (setMode("view"), setError(null), setDay(null), setPicked(null))}>
              Back
            </button>
          </div>
        </div>
      ) : mode === "cancel" ? (
        <div className="mt-5 space-y-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200" data-manage-cancel="">
          <label className="block text-[14px] font-medium text-[#1a1a2e]" htmlFor="cancel-reason">
            Anything to tell them? (optional)
          </label>
          <textarea id="cancel-reason" maxLength={500} className="min-h-[88px] w-full rounded-xl border border-[#e3e4e8] bg-white px-3 py-2.5 text-[16px] text-[#1a1a2e] outline-none focus:border-[#1a1a2e] focus:ring-2 focus:ring-[#1a1a2e]/10" value={reason} onChange={(e) => setReason(e.target.value)} />
          {error ? <p className="text-[14px] text-[#b42318]" role="alert">{error}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className={`${button} bg-[#b42318] text-white hover:bg-[#912018]`} disabled={busy} onClick={() => void send({ action: "cancel", reason }, "Your booking is cancelled.")}>
              {busy ? "Cancelling…" : "Cancel booking"}
            </button>
            <button type="button" className={secondary} onClick={() => (setMode("view"), setError(null))}>
              Keep it
            </button>
          </div>
        </div>
      ) : b.can_change ? (
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button type="button" className={primary} onClick={() => (setMode("move"), setDone(null), setError(null))}>
            Change time
          </button>
          <button type="button" className={secondary} onClick={() => (setMode("cancel"), setDone(null), setError(null))}>
            Cancel
          </button>
        </div>
      ) : null}
      {mode === "view" && !off ? (
        <div className="mt-4 flex flex-wrap gap-x-4 text-[14px]">
          <a className="inline-flex min-h-11 items-center underline" href={`${base}?ics=1`}>
            Add to calendar
          </a>
          {b.google_add_url ? (
            <a className="inline-flex min-h-11 items-center underline" href={b.google_add_url} target="_blank" rel="noopener noreferrer">
              Google Calendar
            </a>
          ) : null}
        </div>
      ) : null}
      {mode === "view" && error ? <p className="mt-3 text-[14px] text-[#b42318]" role="alert">{error}</p> : null}
    </section>
  )
}
