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
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatusBadge } from "@/app/app/orders/order-parts"
import { eventDateBadge, eventTime } from "@/lib/communities/format"
import type { AccessRuleJson, EventKind } from "@/lib/communities/types"
import type { ActionMenuItem } from "@/components/ui/responsive-action-menu"
import type { CommunityHead, EventEditView, RuleOptions } from "./view-types"
import { EVENT_KIND_LABEL, checkEvent, utcToZonedParts } from "./logic"
import { AccessEditor } from "./access-editor"
import { Confirm, Dialog, Empty, Notice, PicturePick, RowMenu, Segmented, buttonPrimary, buttonSecondary, card, errorText, field, label, selectField, send, useToast } from "./parts"

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
  return { id: null, title: "", description: "", kind: "online", startDate: parts.date, startTime: "18:00", endDate: parts.date, endTime: "19:00", timezone: zone, location: "", meetingUrl: "", livestreamUrl: "", capacity: "", coverUrl: null, access: {}, replay: "", past: false }
}

function draftOf(e: EventEditView): Draft {
  const s = utcToZonedParts(e.startsAt, e.timezone)
  const en = utcToZonedParts(e.endsAt, e.timezone)
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
  }
}

export function EventsSection({ head, initial, options, openNew }: { head: CommunityHead; initial: { upcoming: EventEditView[]; past: EventEditView[] }; options: RuleOptions; openNew: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const base = `/api/app/community/${head.id}/events`
  const [data, setData] = React.useState(initial)
  const [view, setView] = React.useState<"upcoming" | "past">("upcoming")
  const [draft, setDraft] = React.useState<Draft | null>(openNew ? blankDraft() : null)
  const [cancelling, setCancelling] = React.useState<EventEditView | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<{ text: string; field?: string } | null>(null)
  const zoneList = React.useMemo(() => zones(draft?.timezone ?? browserZone()), [draft?.timezone])

  const reload = async () => {
    const res = await send<{ upcoming: EventEditView[]; past: EventEditView[] }>(base, "GET")
    if (res.ok) setData({ upcoming: res.data.upcoming ?? [], past: res.data.past ?? [] })
  }

  const save = async () => {
    if (!draft) return
    const checked = checkEvent(draft)
    if (!checked.ok) return setError({ text: checked.error, field: checked.field })
    setBusy(true)
    setError(null)
    const body = { ...draft, replay: draft.id ? draft.replay : undefined }
    const res = draft.id ? await send(`${base}/${draft.id}`, "PATCH", body) : await send(base, "POST", body)
    setBusy(false)
    if (!res.ok) return setError({ text: errorText(res.data.error, "The event could not be saved."), field: res.data.field })
    setDraft(null)
    toast(draft.id ? "Event saved" : "Event scheduled")
    await reload()
    router.refresh()
  }

  const setStatus = async (e: EventEditView, status: "cancelled" | "scheduled") => {
    setBusy(true)
    const res = await send(`${base}/${e.id}`, "PATCH", { status })
    setBusy(false)
    if (!res.ok) return toast(errorText(res.data.error))
    setCancelling(null)
    toast(status === "cancelled" ? "Event cancelled" : "Event back on")
    await reload()
  }

  const menu = (e: EventEditView): ActionMenuItem[] => {
    const items: ActionMenuItem[] = [
      { label: Date.parse(e.startsAt) < Date.now() ? "Edit or add the replay" : "Edit", onClick: () => { setError(null); setDraft(draftOf(e)) } },
      { label: "Open event page", href: `/community/${head.slug}/events/${e.id}`, target: "_blank" },
    ]
    if (e.status === "scheduled" && Date.parse(e.startsAt) > Date.now()) items.push({ label: "Cancel event", variant: "destructive", onClick: () => setCancelling(e), separatorBefore: true })
    if (e.status === "cancelled") items.push({ label: "Put it back on", onClick: () => void setStatus(e, "scheduled"), separatorBefore: true })
    return items
  }

  const list = view === "upcoming" ? data.upcoming : data.past
  const bad = (f: string) => error?.field === f
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d))

  return (
    <div className="space-y-4" data-events="">
      <div className="flex items-center justify-between gap-3">
        <Segmented value={view} onChange={setView} label="Which events" options={[{ value: "upcoming", label: `Upcoming${data.upcoming.length ? ` ${data.upcoming.length}` : ""}` }, { value: "past", label: "Past" }]} />
        <button type="button" onClick={() => { setError(null); setDraft(blankDraft()) }} className={cn(buttonPrimary, "max-md:h-10 max-md:px-3.5")} data-event-new="">
          <Plus aria-hidden className="h-4 w-4" />
          Schedule
        </button>
      </div>

      <section className={cn(card, "overflow-hidden")}>
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
                    <p className="truncate text-[12.5px] text-[#6b7280]">{[eventTime(e.startsAt, e.endsAt), EVENT_KIND_LABEL[e.kind], `${e.goingCount}${e.capacity ? ` of ${e.capacity}` : ""} going`].join(" · ")}</p>
                  </div>
                  <RowMenu items={menu(e)} label={`Actions for ${e.title}`} />
                </li>
              )
            })}
          </ul>
        )}
      </section>

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
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
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
            <div className="grid gap-3 sm:grid-cols-2">
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
                  Capacity
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
            {draft.id ? (
              <div>
                <label htmlFor="ev-replay" className={label}>
                  Replay
                </label>
                <input id="ev-replay" value={draft.replay} onChange={(e) => set("replay", e.target.value.trim().slice(0, 300))} placeholder="A Storelib video id, or a link with one in it" aria-invalid={bad("replay") || undefined} className={cn(field, "h-11 font-mono text-[13px] sm:h-10", bad("replay") && "border-[#dc2626]")} />
                <p className="mt-1 text-[12.5px] text-[#6b7280]">Members who could attend can watch it on the event page afterwards.</p>
              </div>
            ) : null}
            {error ? <Notice>{error.text}</Notice> : null}
          </div>
        ) : null}
      </Dialog>

      <Confirm open={cancelling !== null} onClose={() => setCancelling(null)} title={`Cancel ${cancelling?.title ?? "this event"}?`} detail="It shows as cancelled to members. You can put it back on." action="Cancel event" danger busy={busy} onConfirm={() => cancelling && void setStatus(cancelling, "cancelled")} />
    </div>
  )
}
