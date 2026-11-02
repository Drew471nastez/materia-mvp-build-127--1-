"use client"

/**
 * Publish, as one button and what it opens. A draft: publish now, or
 * schedule it for a date and time in the app's own time zone (Settings ›
 * time zone, lib/i18n/format appTimeZone). A live post: Update (its draft
 * changes go live) or Unpublish. A scheduled one: Update, Publish now, a new
 * time, or cancel the schedule. The time is turned into an instant here
 * (instantAt), so the server stores the moment the creator meant wherever
 * the browser is.
 */
import * as React from "react"
import { CalendarClock, ChevronDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appTimeZone, formatDateTime } from "@/lib/i18n/format"
import type { AdminPost } from "@/lib/site-blog/types"
import type { PostAction } from "./api"
import { instantFromInputs, zonedInputs } from "./model"

export function PublishButton({
  post,
  dirty,
  busy,
  error,
  onAct,
}: {
  post: AdminPost
  /** Edits not yet live: a live post's Update has something to do. */
  dirty: boolean
  busy: PostAction | null
  error: string | null
  onAct: (action: PostAction, publishAt?: string | null) => Promise<boolean>
}) {
  const [open, setOpen] = React.useState(false)
  const [mode, setMode] = React.useState<"now" | "later">(post.status === "scheduled" ? "later" : "now")
  const zone = appTimeZone()
  const start = post.status === "scheduled" && post.publishedAt ? post.publishedAt : Date.now() + 60 * 60 * 1000
  const [when, setWhen] = React.useState(() => zonedInputs(start, zone))
  const box = React.useRef<HTMLDivElement>(null)
  const trigger = React.useRef<HTMLButtonElement>(null)
  const id = React.useId()

  /* Away and Escape close it; Escape is the popover's, not the editor's or Settings'. */
  React.useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener("pointerdown", away)
    window.addEventListener("keydown", esc, true)
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>("button:not(:disabled), input")?.focus())
    return () => {
      document.removeEventListener("pointerdown", away)
      window.removeEventListener("keydown", esc, true)
    }
  }, [open])

  const at = instantFromInputs(when.date, when.time, zone)
  const future = at !== null && at.getTime() > Date.now() + 30_000
  const live = post.status === "published"
  const scheduled = post.status === "scheduled"
  const label = live ? tt("Update") : scheduled ? tt("Scheduled") : tt("Publish")

  async function go(action: PostAction, publishAt?: string | null) {
    if (await onAct(action, publishAt)) setOpen(false)
  }

  const primary = "flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-white px-4 text-[15px] font-semibold text-[#0f0f0f] transition-opacity hover:opacity-90 disabled:opacity-50 md:h-10 md:text-[14px]"
  const secondary = "flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-white/[0.13] bg-white/[0.06] px-4 text-[15px] font-medium text-white transition-colors hover:bg-white/[0.1] disabled:opacity-50 md:h-10 md:text-[14px]"
  const spin = (a: PostAction) => (busy === a ? <Loader2 className="h-4 w-4 animate-spin" /> : null)

  return (
    <div className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        data-blog-publish=""
        className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-white pl-4 pr-3 text-[14.5px] font-semibold text-[#0f0f0f] shadow-[inset_0_-1px_0_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.4)] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 md:h-9 md:text-[14px]"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : scheduled ? <CalendarClock className="h-4 w-4" /> : null}
        {label}
        <ChevronDown className={cn("h-4 w-4 transition-[rotate] duration-200 motion-reduce:transition-none", open && "rotate-180")} />
      </button>

      {open && (
        <div
          ref={box}
          id={id}
          role="dialog"
          aria-label={label}
          data-blog-publish-panel=""
          className="wb-settings-in fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-[175] rounded-2xl border border-white/10 bg-[#1a1a1a] p-4 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.9)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[340px]"
        >
          {live || scheduled ? (
            <p className="text-[14px] leading-snug text-white/70">
              {live
                ? dirty
                  ? tt("This post is live. Update puts your changes on the website.")
                  : tt("This post is live, and visitors see what you see here.")
                : tt("Goes live {when}", { when: formatDateTime(post.publishedAt ?? "", { dateStyle: "medium", timeStyle: "short" }) })}
            </p>
          ) : (
            <div role="radiogroup" aria-label={tt("When")} className="grid grid-cols-2 gap-1 rounded-xl bg-white/[0.05] p-1">
              {(["now", "later"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={cn("h-9 rounded-lg text-[14px] font-medium transition-colors", mode === m ? "bg-white/[0.12] text-white" : "text-white/60 hover:text-white")}
                >
                  {m === "now" ? tt("Now") : tt("Schedule")}
                </button>
              ))}
            </div>
          )}

          {(mode === "later" || scheduled) && (
            <fieldset className="mt-3">
              <legend className="sr-only">{tt("Date and time")}</legend>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  type="date"
                  value={when.date}
                  onChange={(e) => setWhen((w) => ({ ...w, date: e.target.value }))}
                  aria-label={tt("Date")}
                  className="h-11 min-w-0 rounded-lg border border-white/12 bg-[#171717] px-3 text-[16px] text-white outline-none [color-scheme:dark] focus:border-white/35 md:h-10 md:text-[14px]"
                />
                <input
                  type="time"
                  value={when.time}
                  onChange={(e) => setWhen((w) => ({ ...w, time: e.target.value }))}
                  aria-label={tt("Time")}
                  className="h-11 w-[116px] rounded-lg border border-white/12 bg-[#171717] px-3 text-[16px] text-white outline-none [color-scheme:dark] focus:border-white/35 md:h-10 md:text-[14px]"
                />
              </div>
              <p className="mt-1.5 text-[12.5px] text-white/50">{tt("Time zone: {zone}", { zone: zone.replace(/_/g, " ") })}</p>
              {at && !future && <p className="mt-1 text-[12.5px] text-amber-200">{tt("Pick a time in the future.")}</p>}
            </fieldset>
          )}

          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13.5px] leading-snug text-red-300">
              {error}
            </p>
          )}

          <div className="mt-4 space-y-2">
            {!live && !scheduled && mode === "now" && (
              <button type="button" disabled={!!busy} onClick={() => void go("publish")} className={primary} data-blog-act="publish">
                {spin("publish")}
                {tt("Publish now")}
              </button>
            )}
            {!live && !scheduled && mode === "later" && (
              <button type="button" disabled={!!busy || !future} onClick={() => at && void go("schedule", at.toISOString())} className={primary} data-blog-act="schedule">
                {spin("schedule")}
                {tt("Schedule")}
              </button>
            )}
            {live && (
              <button type="button" disabled={!!busy || !dirty} onClick={() => void go("update")} className={primary} data-blog-act="update">
                {spin("update")}
                {dirty ? tt("Update") : tt("Up to date")}
              </button>
            )}
            {scheduled && (
              <>
                <button type="button" disabled={!!busy || !future} onClick={() => at && void go("schedule", at.toISOString())} className={primary} data-blog-act="schedule">
                  {spin("schedule")}
                  {tt("Save schedule")}
                </button>
                <button type="button" disabled={!!busy} onClick={() => void go("publish", new Date().toISOString())} className={secondary} data-blog-act="publish">
                  {spin("publish")}
                  {tt("Publish now")}
                </button>
              </>
            )}
            {(live || scheduled) && (
              <button type="button" disabled={!!busy} onClick={() => void go("unpublish")} className={cn(secondary, "text-red-300")} data-blog-act="unpublish">
                {spin("unpublish")}
                {scheduled ? tt("Cancel schedule") : tt("Unpublish")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
