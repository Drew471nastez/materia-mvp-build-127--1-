"use client"

/**
 * ===========================================================================
 *  SCHEDULED POSTS AND DRAFTS (round 32), Feed
 * ===========================================================================
 * Write a post now and choose when it goes up, or keep it as a draft. The
 * list: what is waiting, soonest first, then drafts, then what went up or
 * failed in the last two weeks. A row says what it is (Scheduled, Draft,
 * Failed, Posted), the space, and when; pressing one opens it to change,
 * reschedule, publish now or delete (its author, or the owner and admins).
 * A failed one says why and can be scheduled again. A posted one opens the
 * post.
 *
 * The form is the section forms' sheet on a phone and dialog on a computer
 * (./form-sheet.tsx): the space, the title, the words, then Schedule or
 * Draft, and for Schedule a day and a time in the device's own zone (named
 * under them). Posts go up within five minutes of their time, through the
 * ordinary post path, so members hear about an announcement as usual
 * (lib/communities/server/scheduled-posts.ts).
 *
 * Mounted by Feed above its list: <ScheduledPostsPanel head={head}
 * initial={scheduled} />. It writes its own data (app/api/app/community/[id]/
 * scheduled-posts).
 *
 * ROUND 33, the owner: the panel "appears very delayed and has to load". It
 * read itself only after the page had arrived, behind a spinner, so it came a
 * request after everything else and pushed the list down when it did. Now:
 *
 *   WITH THE PAGE   the Posts page reads its rows on the server beside the
 *                   posts (lib/communities/server/admin-sections.ts feedReads,
 *                   scheduledPanelReads) and hands them in as `initial`, so
 *                   the panel is in the first paint of the section.
 *   KEPT            what it last showed is kept per community (KEPT below), so
 *                   coming back draws it at once and reads it again quietly.
 *   ITS FRAME       with neither, the card is drawn at once with its title and
 *                   its words and one quiet line where the rows go, the same
 *                   height as "Nothing scheduled", never a spinner. It is the
 *                   card the Posts frame draws too (section-frame.tsx
 *                   ScheduledFrame), so the list under it does not move.
 *   NOBODY ELSE     someone who may not post sees no panel and asks nothing.
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { relativeTime } from "@/lib/communities/format"
import { LENGTHS } from "@/lib/communities/limits"
import { EDITABLE, fromLocalParts, localParts, type ScheduledPanelData, type ScheduledPostView, type ScheduledStatus } from "@/lib/communities/scheduled-posts"
import { ScheduledFrame } from "./section-frame"
import { StatusBadge } from "@/app/app/orders/order-parts"
import type { CommunityHead } from "./view-types"
import { FormSheet } from "./form-sheet"
import { ROW_PRESS, rowPress } from "./rows"
import { Confirm, Notice, Section, Segmented, SelectField, buttonPrimary, buttonSecondary, errorText, field, label, send, useToast } from "./parts"

type Loaded = ScheduledPanelData

/** What each community's panel last showed, for as long as the page is open (KEPT, above). */
const KEPT = new Map<string, Loaded>()

interface Form {
  id: string | null
  spaceId: string
  title: string
  body: string
  mode: "schedule" | "draft"
  day: string
  time: string
}

const STATUS: Record<ScheduledStatus, { tone: "neutral" | "attention" | "critical" | "success"; get label(): string }> = {
  draft: { tone: "neutral", get label() { return tt("Draft") } },
  scheduled: { tone: "attention", get label() { return tt("Scheduled") } },
  publishing: { tone: "attention", get label() { return tt("Posting") } },
  published: { tone: "success", get label() { return tt("Posted") } },
  failed: { tone: "critical", get label() { return tt("Failed") } },
}

/** "Thu, Oct 15, 9:30 AM" in the device's own zone, the zone the form's day and time are in. */
function when(iso: string | null): string {
  if (!iso) return ""
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ""
  return new Intl.DateTimeFormat(appLocale(), { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(t)
}

function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ""
  } catch {
    return ""
  }
}

export function ScheduledPostsPanel({ head, initial }: { head: CommunityHead; /** Read on the server with the page (round 33); null or left out, the panel reads itself. */ initial?: Loaded | null }) {
  const toast = useToast()
  const router = useRouter()
  const allowed = head.can.post === true
  const [data, setData] = React.useState<Loaded | null>(() => initial ?? KEPT.get(head.id) ?? null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<Form | null>(null)
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState<"save" | "now" | "delete" | null>(null)
  const [error, setError] = React.useState<{ text: string; field?: string } | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const load = React.useCallback(async () => {
    const res = await send<Loaded>(`/api/app/community/${head.id}/scheduled-posts`, "GET")
    /* A read again that fails leaves what is on screen as it is; only a panel with nothing to show says so. */
    if (!res.ok) return setLoadError(errorText(res.data.error, tt("This did not load. Refresh the page.")))
    setLoadError(null)
    KEPT.set(head.id, res.data)
    setData(res.data)
  }, [head.id])

  /* Handed in by the server: it is the latest there is, kept and drawn, nothing asked. Otherwise read (quietly when kept). */
  React.useEffect(() => {
    if (!allowed) return
    if (initial) {
      KEPT.set(head.id, initial)
      setData(initial)
      return
    }
    void load()
  }, [allowed, initial, head.id, load])

  const spaces = data?.spaces ?? []
  const start = (row?: ScheduledPostView) => {
    const [day, time] = localParts(row?.publishAt ?? null)
    setForm({
      id: row?.id ?? null,
      spaceId: row?.spaceId && spaces.some((s) => s.id === row.spaceId) ? row.spaceId : (spaces.find((s) => s.kind === "announcements")?.id ?? spaces[0]?.id ?? ""),
      title: row?.title ?? "",
      body: row?.body ?? "",
      mode: row && row.status === "draft" ? "draft" : "schedule",
      day,
      time,
    })
    setError(null)
    setOpen(true)
  }

  const payload = (f: Form) => ({ spaceId: f.spaceId || null, title: f.title, body: f.body, publishAt: f.mode === "draft" ? null : fromLocalParts(f.day, f.time) ?? "" })

  const save = async () => {
    if (!form || busy) return
    setBusy("save")
    setError(null)
    const res = form.id
      ? await send<{ post: ScheduledPostView }>(`/api/app/community/${head.id}/scheduled-posts/${form.id}`, "PATCH", payload(form))
      : await send<{ post: ScheduledPostView }>(`/api/app/community/${head.id}/scheduled-posts`, "POST", payload(form))
    setBusy(null)
    if (!res.ok) return setError({ text: res.data.error === "not_ready" ? tt("Scheduling needs the database update (run-now part 194).") : errorText(res.data.error), field: res.data.field })
    setOpen(false)
    toast(form.mode === "draft" ? tt("Draft saved") : tt("Scheduled for {value}", { value: when(res.data.post.publishAt) }))
    void load()
  }

  const publishNow = async () => {
    if (!form?.id || busy) return
    setBusy("now")
    setError(null)
    const res = await send<{ post: ScheduledPostView }>(`/api/app/community/${head.id}/scheduled-posts/${form.id}`, "PATCH", { ...payload({ ...form, mode: "draft" }), publishNow: true })
    setBusy(null)
    if (!res.ok) {
      void load()
      return setError({ text: errorText(res.data.error), field: res.data.field })
    }
    setOpen(false)
    toast(tt("Posted"))
    router.refresh()
    void load()
  }

  const remove = async () => {
    if (!form?.id) return
    setBusy("delete")
    const res = await send(`/api/app/community/${head.id}/scheduled-posts/${form.id}`, "DELETE")
    setBusy(null)
    setDeleting(false)
    if (!res.ok) return setError({ text: errorText(res.data.error) })
    setOpen(false)
    toast(tt("Deleted"))
    void load()
  }

  if (!allowed) return null
  if (loadError && !data) return <Notice>{loadError}</Notice>
  if (!data) return <ScheduledFrame />

  const waiting = data.rows.filter((r) => r.status === "scheduled" || r.status === "publishing")
  const drafts = data.rows.filter((r) => r.status === "draft")
  const recent = data.rows.filter((r) => r.status === "published" || r.status === "failed")
  const zone = deviceZone()

  const row = (r: ScheduledPostView) => {
    const s = STATUS[r.status]
    const editable = r.mine && EDITABLE.includes(r.status)
    const line =
      r.status === "scheduled" || r.status === "publishing"
        ? tt("Goes up {value}", { value: when(r.publishAt) })
        : r.status === "published"
          ? tt("Posted {value}", { value: when(r.publishedAt) })
          : r.status === "failed"
            ? r.error || tt("It did not go up.")
            : tt("Edited {value}", { value: relativeTime(r.updatedAt) })
    const words = r.title || r.body.split("\n")[0] || tt("Untitled")
    const go = () => {
      if (r.status === "published" && r.postId) router.push(`/community/${head.slug}/post/${r.postId}`)
      else if (editable) start(r)
    }
    const pressable = editable || (r.status === "published" && !!r.postId)
    return (
      <li key={r.id} onClick={pressable ? rowPress(go) : undefined} className={cn("flex min-h-[60px] items-center gap-3 py-2.5", pressable && cn(ROW_PRESS, "-mx-4 px-4 sm:-mx-5 sm:px-5"))} data-scheduled-row={r.status}>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
            {pressable ? (
              <button type="button" data-row-open="" className="min-w-0 truncate text-left text-[14.5px] font-medium text-[#1a1a2e] outline-none">
                {words}
              </button>
            ) : (
              <span className="min-w-0 truncate text-[14.5px] font-medium text-[#1a1a2e]">{words}</span>
            )}
          </div>
          <p className={cn("mt-1 truncate text-[13px]", r.status === "failed" ? "text-[#b42318]" : "text-[#6b7280]")}>
            {[r.spaceName, line, r.mine ? null : r.authorName].filter(Boolean).join(" · ")}
          </p>
        </div>
      </li>
    )
  }

  const group = (title: string, rows: ScheduledPostView[]) =>
    rows.length ? (
      <div className="mt-1 first:mt-0" data-scheduled-group="">
        <p className="pb-1 pt-2 text-[12px] font-medium text-[#9ca3af]">{title}</p>
        <ul className="divide-y divide-[#f1f2f4]">{rows.map(row)}</ul>
      </div>
    ) : null

  const bad = (f: string) => error?.field === f
  return (
    <Section
      title={tt("Scheduled and drafts")}
      hint={tt("Write a post now and choose when it goes up, or keep it as a draft.")}
      action={
        data.ready && spaces.length ? (
          <button type="button" onClick={() => start()} className={buttonPrimary} data-scheduled-new="">
            <Plus aria-hidden className="h-4 w-4" />
            {tt("Schedule a post")}
          </button>
        ) : null
      }
    >
      <div data-scheduled-panel="">
        {!data.ready ? (
          <Notice tone="warn">{tt("Scheduling needs the database update (run-now part 194).")}</Notice>
        ) : !spaces.length ? (
          <p className="text-[13.5px] text-[#6b7280]">{tt("There is no space you can post in yet.")}</p>
        ) : data.rows.length === 0 ? (
          <p className="text-[13.5px] text-[#6b7280]">{tt("Nothing scheduled. Posts go up within five minutes of their time.")}</p>
        ) : (
          <>
            {group(tt("Scheduled"), waiting)}
            {group(tt("Drafts"), drafts)}
            {group(tt("Last two weeks"), recent)}
          </>
        )}
      </div>

      <FormSheet
        open={open}
        onClose={() => setOpen(false)}
        title={form?.id ? tt("Edit post") : tt("Schedule a post")}
        name="scheduled-post"
        wide
        focus={!form?.id}
        action={form ? { label: form.mode === "draft" ? tt("Save draft") : tt("Schedule"), busyLabel: tt("Saving"), busy: busy === "save", onClick: () => void save(), data: { "data-scheduled-save": "" } } : null}
      >
        {form ? (
          <div className="space-y-3.5">
            <div>
              <span className={label}>{tt("Space")}</span>
              <SelectField name="scheduled-space" title={tt("Space")} value={form.spaceId} options={spaces.map((s) => ({ value: s.id, label: s.name }))} onChange={(spaceId) => setForm({ ...form, spaceId })} className={bad("space") ? "border-[#dc2626]" : undefined} />
            </div>
            <div>
              <label htmlFor="scheduled-title" className={label}>
                {tt("Title")}
              </label>
              <input id="scheduled-title" data-autofocus="" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value.slice(0, LENGTHS.postTitle.max) })} aria-invalid={bad("title") || undefined} className={cn(field, "h-11 sm:h-10", bad("title") && "border-[#dc2626]")} />
            </div>
            <div>
              <label htmlFor="scheduled-body" className={label}>
                {tt("Text")}
              </label>
              <textarea id="scheduled-body" value={form.body} rows={7} onChange={(e) => setForm({ ...form, body: e.target.value.slice(0, LENGTHS.postBody.max) })} aria-invalid={bad("body") || undefined} className={cn(field, "resize-y py-2.5 leading-relaxed", bad("body") && "border-[#dc2626]")} />
            </div>
            <div className="border-t border-[#f1f2f4] pt-3.5">
              <Segmented
                label={tt("When")}
                value={form.mode}
                onChange={(mode) => setForm({ ...form, mode })}
                options={[
                  { value: "schedule", label: tt("Schedule") },
                  { value: "draft", label: tt("Keep as draft") },
                ]}
                className="w-full max-sm:[&>button]:flex-1 sm:w-auto"
              />
              {form.mode === "schedule" ? (
                <>
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,140px)] gap-2">
                    <div>
                      <label htmlFor="scheduled-day" className={label}>
                        {tt("Day")}
                      </label>
                      <input id="scheduled-day" type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} aria-invalid={bad("when") || undefined} className={cn(field, "h-11 sm:h-10", bad("when") && "border-[#dc2626]")} />
                    </div>
                    <div>
                      <label htmlFor="scheduled-time" className={label}>
                        {tt("Time")}
                      </label>
                      <input id="scheduled-time" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} aria-invalid={bad("when") || undefined} className={cn(field, "h-11 sm:h-10", bad("when") && "border-[#dc2626]")} />
                    </div>
                  </div>
                  <p className="mt-1.5 text-[12.5px] text-[#6b7280]">{zone ? tt("Your time ({value}). It goes up within five minutes of it.", { value: zone }) : tt("It goes up within five minutes of the time.")}</p>
                </>
              ) : (
                <p className="mt-2 text-[12.5px] text-[#6b7280]">{tt("Only your team sees drafts, here.")}</p>
              )}
            </div>
            {error ? (
              <p role="alert" className="text-[13px] text-[#b42318]" data-scheduled-error="">
                {error.text}
              </p>
            ) : null}
            {form.id ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-[#f1f2f4] pt-3.5">
                <button type="button" onClick={() => void publishNow()} disabled={!!busy} className={buttonSecondary} data-scheduled-now="">
                  {busy === "now" ? tt("Posting") : tt("Publish now")}
                </button>
                <button type="button" onClick={() => setDeleting(true)} disabled={!!busy} className="inline-flex h-10 items-center rounded-lg px-3 text-[13px] font-medium text-[#b42318] outline-none hover:bg-[#fef2f2] focus-visible:ring-2 focus-visible:ring-[#b42318]/25 sm:h-8" data-scheduled-delete="">
                  {tt("Delete")}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </FormSheet>

      <Confirm open={deleting} onClose={() => setDeleting(false)} title={tt("Delete this post?")} detail={tt("It will not go up. This cannot be undone.")} action={tt("Delete")} danger busy={busy === "delete"} onConfirm={() => void remove()} />
    </Section>
  )
}
