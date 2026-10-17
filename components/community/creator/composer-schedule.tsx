"use client"

/**
 * ===========================================================================
 *  SCHEDULE, SAVE A DRAFT, CHANGE A SCHEDULED POST: IN THE COMPOSER (round 26)
 * ===========================================================================
 * The owner: "Remove the separate Schedule Post modal as an independent
 * workflow. Creators must be able to schedule posts directly from the
 * existing Share something composer." So the people who run a community get
 * three more things in the one writer they already use (components/community/
 * member/composer.tsx, passed `staff` by the admin's Posts only; a member
 * never sees any of this):
 *
 *   SCHEDULE   the clock in the toolbar turns a day and a time on, in the
 *              creator's own time zone (Settings, lib/i18n/format.ts
 *              appTimeZone), named under them, with the device's clock beside
 *              it when the two differ. Post then reads Schedule.
 *   SAVE DRAFT beside Cancel (in the toolbar on a phone), and as a third answer
 *              to "Leave without posting?": a team draft in the Scheduled and
 *              drafts list, not only this browser's kept copy.
 *   CHANGE ONE a row of that list opens it here (`staff.open`): its words, its
 *              space and its time, to save, reschedule, post now, turn back
 *              into a draft or delete (asked in the line itself, no second
 *              dialog). What was being written before waits in this browser's
 *              kept draft and comes back after.
 *
 * ONE BACKEND. Every write is part 194's (app/api/app/community/[id]/
 * scheduled-posts, lib/communities/server/scheduled-posts.ts), checked first
 * here with the server's own rules (checkScheduledInput). Part 194 keeps a
 * title, the words and a space: a post with pictures, files, a video, a GIF,
 * a link card or a poll can be posted now but not kept for later, and the
 * line says so instead of dropping them.
 */
import * as React from "react"
import { CalendarClock, X } from "lucide-react"
import { tt } from "@/lib/i18n/text"
import { appTimeZone, formatDateTime } from "@/lib/i18n/format"
import { requestJson } from "@/lib/net/request"
import { checkScheduledInput, fromLocalParts, localParts, scheduleBody, suggestedPublishAt, SCHEDULE_MAX_AHEAD_MS, type ScheduledPostView } from "@/lib/communities/scheduled-posts"

/** What the admin hands the composer (feed-section.tsx). */
export interface ComposerStaff {
  /** Part 194 is in the database (false: the clock and Save draft are not offered). */
  ready: boolean
  /** Open the composer for this, once per `seq`: a scheduled post or draft to change, or a new post with Schedule on. */
  open: { seq: number; item: ScheduledPostView | null } | null
  /** The server has it (after the composer has closed). */
  onSaved: (done: StaffSaved) => void
}

export type StaffSaved = { kind: "scheduled" | "draft" | "published"; post: ScheduledPostView } | { kind: "deleted"; id: string }

/** What the composer lets the kit do: its fields, and its own close with the check (AFTER POST). */
export interface StaffBridge {
  communityId: string
  title: string
  body: string
  spaceId: string | null
  /** Pictures, files, videos, GIFs, a link card or a poll: part 194 cannot keep them. */
  extras: number
  open: boolean
  /** Fill the fields with a scheduled post (saving what was being written first), or put back what was being written (null). */
  load: (item: ScheduledPostView | null) => void
  /** Open the editor (in place, or the phone's sheet), the caret in the first field. */
  openEditor: () => void
  setBusy: (on: boolean) => void
  /** Show the check, close, then run `then` once the editor has gone. */
  finish: (then: () => void) => void
  /** The field to bring the person to. */
  nudge: (field: "title" | "body" | "space") => void
  /** A short word at the foot of the screen. */
  toast: (text: string) => void
}

export interface StaffKit {
  /** Scheduling is offered here at all. */
  on: boolean
  /** The scheduled post or draft open here, if any. */
  item: ScheduledPostView | null
  /** When it goes up (ISO), or null for now. */
  when: string | null
  /** Something to lose on Cancel, for a scheduled post or draft (null when none is open). */
  dirty: boolean | null
  /** Primary's word and its pending and done words. */
  label: { idle: string; busy: string; sent: string } | null
  /** Anything that keeps the primary from going (the schedule's own part; the composer checks the rest). */
  ready: boolean
  /** Primary pressed: true when the kit took it (a schedule, a change, a post of a scheduled one). */
  primary: () => Promise<boolean>
  saveDraft: () => Promise<void>
  /** Forget the scheduled post or draft open here (closed without saving). */
  release: () => void
  /** Save draft is a fair third answer to "Leave without posting?". */
  draftOnLeave: boolean
  /** The phone sheet's title. */
  sheetTitle: string | null
}

/** The schedule's own words, the same that sit beside the day and the time. */
const BLOCKED = () => tt("Pictures, files, videos, GIFs, link cards and polls can only be posted now. Take them off to schedule this or keep it as a draft.")

function fieldWords(field: string | undefined, fallback: string): string {
  switch (field) {
    case "space":
      return tt("Choose a space first.")
    case "title":
      return tt("Give the post a title.")
    case "body":
      return tt("Write something in the post.")
    case "when":
      return fallback
    default:
      return fallback
  }
}

/** "Thu, Oct 22, 9:30 AM" in the creator's zone and language. */
export function whenWords(iso: string | null, zone?: string): string {
  if (!iso) return ""
  return formatDateTime(iso, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(zone ? { timeZone: zone } : null) })
}

function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ""
  } catch {
    return ""
  }
}

type Sent = { ok: boolean; status: number; data: { post?: ScheduledPostView; error?: string; field?: string } }

async function write(url: string, method: "POST" | "PATCH" | "DELETE", json?: unknown): Promise<Sent> {
  try {
    const r = await requestJson<{ post?: ScheduledPostView; field?: string }>(url, { method, json, credentials: "same-origin", cache: "no-store" })
    return r as Sent
  } catch {
    return { ok: false, status: 0, data: { error: tt("No connection. Check it and try again.") } }
  }
}

function serverWords(r: Sent): string {
  const raw = r.data?.error
  if (raw === "not_ready") return tt("Scheduling needs the database update (run-now part 194).")
  if (r.status === 0 && !raw) return tt("No connection. Check it and try again.")
  if (!raw || /^[a-z_]+$/.test(raw)) return tt("That did not save. Try again.")
  return fieldWords(r.data.field === "when" ? undefined : r.data.field, tt(raw))
}

/**
 * The kit. Called on every composer render (a hook); with `staff` null it is inert and draws nothing, so a member's
 * composer is exactly what it was.
 */
export function useStaffSchedule(staff: ComposerStaff | null | undefined, bridge: StaffBridge): StaffKit & { tool: (className: string) => React.ReactNode; panel: React.ReactNode; itemLine: React.ReactNode; draftButton: (className: string) => React.ReactNode } {
  const on = !!staff && staff.ready
  const [item, setItem] = React.useState<ScheduledPostView | null>(null)
  const [when, setWhen] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusyKind] = React.useState<null | "primary" | "draft" | "delete">(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const zone = on ? appTimeZone() : "UTC"
  const latest = React.useRef({ bridge, staff })
  latest.current = { bridge, staff }

  /* A row of the list, or Schedule a post, asked for this composer (once per seq). */
  const seq = staff?.open?.seq ?? 0
  React.useEffect(() => {
    if (!seq || !on) return
    const ask = latest.current.staff?.open
    if (!ask) return
    const b = latest.current.bridge
    const it = ask.item
    setError(null)
    setConfirmDelete(false)
    if (it) {
      b.load(it)
      setItem(it)
      const future = it.publishAt && Date.parse(it.publishAt) > Date.now() + 60_000 ? it.publishAt : null
      setWhen(it.status === "draft" ? null : (future ?? suggestedPublishAt(Date.now(), appTimeZone())))
    } else {
      setWhen((w) => w ?? suggestedPublishAt(Date.now(), appTimeZone()))
    }
    b.openEditor()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq])

  /* Closed: what was here goes with the editor (a new open starts as it should). */
  React.useEffect(() => {
    if (bridge.open) return
    setError(null)
    setConfirmDelete(false)
  }, [bridge.open])

  const release = React.useCallback(() => {
    setItem(null)
    setWhen(null)
    setError(null)
    setConfirmDelete(false)
  }, [])

  const base = `/api/app/community/${bridge.communityId}/scheduled-posts`
  const payload = (publishAt: string | null) => scheduleBody(bridge, publishAt)

  /* What would stop it, as the server would say it, said here first; the field it is about gets the caret. */
  const precheck = (publishAt: string | null): boolean => {
    if (bridge.extras > 0) {
      setError(BLOCKED())
      return false
    }
    const checked = checkScheduledInput(payload(publishAt))
    if (checked.ok) return true
    const f = checked.field
    setError(fieldWords(f, f === "when" ? tt("Pick a time at least a minute from now and within a year, or post it now.") : tt("That did not save. Try again.")))
    if (f === "title" || f === "body" || f === "space") latest.current.bridge.nudge(f)
    return false
  }

  const done = (saved: StaffSaved, said: string) => {
    const b = latest.current.bridge
    b.finish(() => {
      release()
      b.toast(said)
      latest.current.staff?.onSaved(saved)
    })
  }

  const send = async (kind: "primary" | "draft", publishAt: string | null, now = false) => {
    setBusyKind(kind)
    setError(null)
    const b = latest.current.bridge
    b.setBusy(true)
    const r = item ? await write(`${base}/${item.id}`, "PATCH", now ? { ...payload(null), publishNow: true } : payload(publishAt)) : await write(base, "POST", payload(publishAt))
    b.setBusy(false)
    setBusyKind(null)
    const post = r.data?.post
    if (!r.ok || !post) {
      setError(serverWords(r))
      return
    }
    if (now) return done({ kind: "published", post }, tt("Posted"))
    if (post.status === "draft") return done({ kind: "draft", post }, tt("Draft saved"))
    done({ kind: "scheduled", post }, tt("Scheduled for {value}", { value: whenWords(post.publishAt) }))
  }

  const primary = async (): Promise<boolean> => {
    if (!on || busy) return !!busy
    if (!when && !item) return false
    if (!when && item) {
      /* A scheduled post or draft, put up now through part 194's own publish (the ordinary post path). */
      if (!precheck(new Date(Date.now() + 120_000).toISOString())) return true
      await send("primary", null, true)
      return true
    }
    if (!precheck(when)) return true
    await send("primary", when)
    return true
  }

  const saveDraft = async () => {
    if (!on || busy) return
    if (!precheck(null)) return
    await send("draft", null)
  }

  const remove = async () => {
    if (!item || busy) return
    setBusyKind("delete")
    const r = await write(`${base}/${item.id}`, "DELETE")
    setBusyKind(null)
    if (!r.ok) {
      setConfirmDelete(false)
      setError(serverWords(r))
      return
    }
    const id = item.id
    done({ kind: "deleted", id }, tt("Deleted"))
  }

  /* A scheduled post or draft: changed from what it was? */
  const dirty = item
    ? bridge.title.trim() !== item.title.trim() ||
      bridge.body.trim() !== item.body.trim() ||
      (bridge.spaceId ?? null) !== (item.spaceId ?? null) ||
      (item.status === "draft" ? when !== null : when !== item.publishAt)
    : null

  const label = !on
    ? null
    : item
      ? when
        ? item.status === "scheduled" && when === item.publishAt
          ? { idle: tt("Save"), busy: tt("Saving"), sent: tt("Saved") }
          : { idle: tt("Schedule"), busy: tt("Scheduling"), sent: tt("Scheduled") }
        : { idle: tt("Post now"), busy: tt("Posting"), sent: tt("Posted") }
      : when
        ? { idle: tt("Schedule"), busy: tt("Scheduling"), sent: tt("Scheduled") }
        : null

  const [day, time] = when ? localParts(when, undefined, zone) : ["", ""]
  const setParts = (d: string, t: string) => {
    const iso = fromLocalParts(d, t, zone)
    if (iso) setWhen(iso)
    setError(null)
  }
  const device = deviceZone()
  const today = localParts(null, Date.now(), zone)[0]
  const lastDay = localParts(null, Date.now() + SCHEDULE_MAX_AHEAD_MS - 86_400_000, zone)[0]

  const tool = (className: string) =>
    on ? (
      <button
        type="button"
        aria-label={when ? tt("Post now instead") : tt("Schedule for later")}
        title={when ? tt("Post now instead") : tt("Schedule for later")}
        aria-pressed={!!when}
        className={className}
        onClick={() => {
          setError(null)
          setWhen((w) => (w ? null : item?.publishAt && Date.parse(item.publishAt) > Date.now() + 60_000 ? item.publishAt : suggestedPublishAt(Date.now(), zone)))
        }}
        data-composer-tool="schedule"
      >
        <CalendarClock className="h-5 w-5" strokeWidth={1.75} />
      </button>
    ) : null

  const FIELD =
    "h-11 w-full min-w-0 rounded-[10px] border border-[#e3e5e9] bg-white px-3 text-[16px] tabular-nums text-[#1a1a2e] shadow-[0_1px_1px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.05)] motion-reduce:transition-none sm:h-10 sm:text-[14px]"
  const bad = !!error
  const panel = on ? (
    <>
      {when ? (
        <div className="mt-3 rounded-xl border border-[#e6e8eb] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)]" data-composer-schedule="">
          <div className="flex items-center justify-between border-b border-[#f0f1f3] py-1 pl-3.5 pr-1">
            <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-[#1a1a2e]">
              <CalendarClock className="h-4 w-4 text-[#6b7280]" strokeWidth={2} aria-hidden />
              {tt("Schedule")}
            </span>
            <button
              type="button"
              onClick={() => {
                setWhen(null)
                setError(null)
              }}
              aria-label={tt("Post now instead")}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#6b7280] outline-none transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15"
              data-composer-schedule-off=""
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>
          <div className="p-3 sm:p-3.5">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,150px)] gap-2 sm:grid-cols-[minmax(0,220px)_140px]">
              <label className="block min-w-0">
                <span className="mb-1 block text-[12.5px] font-medium text-[#6b7280]">{tt("Day")}</span>
                <input type="date" value={day} min={today} max={lastDay} required onChange={(e) => setParts(e.target.value, time)} aria-invalid={bad || undefined} className={FIELD} data-composer-schedule-day="" />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-[12.5px] font-medium text-[#6b7280]">{tt("Time")}</span>
                <input type="time" value={time} step={300} required onChange={(e) => setParts(day, e.target.value)} aria-invalid={bad || undefined} className={FIELD} data-composer-schedule-time="" />
              </label>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[#6b7280]" data-composer-schedule-zone={zone}>
              {tt("Goes up {value}, {zone} time, within five minutes of it.", { value: whenWords(when, zone), zone: zone.replace(/_/g, " ") })}
              {device && device !== zone ? <> {tt("That is {value} on this device.", { value: whenWords(when, device) })}</> : null}
            </p>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-[13px] leading-snug text-[#b42318]" data-composer-schedule-error="">
          {error}
        </p>
      ) : null}
    </>
  ) : null

  /* A scheduled post or draft open here: what it is, and Delete asked in the line itself. */
  const itemLine =
    on && item ? (
      <div className="mb-2 flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12.5px]" data-composer-item={item.status}>
        <span className={item.status === "failed" ? "font-medium text-[#b42318]" : "font-medium text-[#6b7280]"}>
          {item.status === "draft"
            ? tt("Editing a draft")
            : item.status === "failed"
              ? tt("It did not go up: {value}", { value: item.error || tt("Try again.") })
              : tt("Editing a scheduled post, set for {value}", { value: whenWords(item.publishAt, zone) })}
        </span>
        {confirmDelete ? (
          <span className="inline-flex items-center gap-1" data-composer-item-confirm="">
            <span className="text-[#4b5563]">{item.status === "scheduled" ? tt("Delete it? It will not go up.") : tt("Delete this draft?")}</span>
            <button type="button" onClick={() => void remove()} disabled={busy === "delete"} className="inline-flex h-8 items-center rounded-lg px-2 font-semibold text-[#b42318] outline-none hover:bg-[#fef2f2] focus-visible:ring-2 focus-visible:ring-[#b42318]/25 max-sm:h-10" data-composer-item-delete-yes="">
              {busy === "delete" ? tt("Deleting") : tt("Delete")}
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="inline-flex h-8 items-center rounded-lg px-2 font-medium text-[#4b5563] outline-none hover:bg-[#f1f2f4] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 max-sm:h-10">
              {tt("Keep")}
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex h-8 items-center rounded-lg px-2 font-medium text-[#b42318] outline-none hover:bg-[#fef2f2] focus-visible:ring-2 focus-visible:ring-[#b42318]/25 max-sm:h-10" data-composer-item-delete="">
            {tt("Delete")}
          </button>
        )}
      </div>
    ) : null

  const draftButton = (className: string) =>
    on ? (
      <button type="button" className={className} onClick={() => void saveDraft()} aria-disabled={!!busy || undefined} data-composer-draft="">
        {busy === "draft" ? tt("Saving") : item?.status === "draft" ? tt("Save draft") : item ? tt("Make it a draft") : tt("Save draft")}
      </button>
    ) : null

  return {
    on,
    item,
    when,
    dirty,
    label,
    ready: !on || (!when && !item) || bridge.extras === 0,
    primary,
    saveDraft,
    release,
    draftOnLeave: on && !item && bridge.extras === 0 && !!(bridge.title.trim() || bridge.body.trim()),
    sheetTitle: on && item ? (item.status === "draft" ? tt("Draft") : tt("Scheduled post")) : null,
    tool,
    panel,
    itemLine,
    draftButton,
  }
}
