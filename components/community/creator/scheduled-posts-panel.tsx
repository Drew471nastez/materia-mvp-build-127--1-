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
 *
 * ROUND 26, the owner: "Remove the separate Schedule Post modal as an
 * independent workflow." The panel's own form (a second writer with its own
 * title and words, opened over the page) is gone. Writing, scheduling and
 * saving a draft are the composer's (./composer-schedule.tsx, in the one
 * "Share something" writer above), and this is the list of what is waiting:
 * a row opens it in that composer to change, reschedule, post now, turn back
 * into a draft or delete; Schedule a post opens the composer with its day
 * and time on; a posted one opens the post over the admin (the community's
 * own post popup). Its times are the creator's time zone (Settings), as the
 * composer's day and time are. The section's frame (section-frame.tsx
 * ScheduledFrame) is unchanged: the same card, title, words and button.
 */
import * as React from "react"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { relativeTime } from "@/lib/communities/format"
import { EDITABLE, type ScheduledPanelData, type ScheduledPostView, type ScheduledStatus } from "@/lib/communities/scheduled-posts"
import { ScheduledFrame } from "./section-frame"
import { StatusBadge } from "@/app/app/orders/order-parts"
import type { CommunityHead } from "./view-types"
import { ROW_PRESS, rowPress } from "./rows"
import { whenWords } from "./composer-schedule"
import { Notice, Section, buttonPrimary, errorText, send } from "./parts"

type Loaded = ScheduledPanelData

/** What each community's panel last showed, for as long as the page is open (KEPT, above). */
const KEPT = new Map<string, Loaded>()

/** What the Posts section tells the panel after the composer has saved, scheduled, posted or deleted one (round 26). */
export interface ScheduledPanelControl {
  /** One row as the server now has it: in at its place, at once; the list is then read again quietly. */
  put: (post: ScheduledPostView) => void
  /** One row gone. */
  drop: (id: string) => void
}

const STATUS: Record<ScheduledStatus, { tone: "neutral" | "attention" | "critical" | "success"; get label(): string }> = {
  draft: { tone: "neutral", get label() { return tt("Draft") } },
  scheduled: { tone: "attention", get label() { return tt("Scheduled") } },
  publishing: { tone: "attention", get label() { return tt("Posting") } },
  published: { tone: "success", get label() { return tt("Posted") } },
  failed: { tone: "critical", get label() { return tt("Failed") } },
}

/** The order the server lists them in (lib/communities/server/scheduled-posts.ts listScheduled): soonest first, then drafts, then what went. */
export function orderScheduled(rows: ScheduledPostView[]): ScheduledPostView[] {
  const rank = (r: ScheduledPostView) => (r.status === "scheduled" || r.status === "publishing" ? 0 : r.status === "draft" ? 1 : 2)
  return [...rows].sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? Date.parse(a.publishAt ?? "") - Date.parse(b.publishAt ?? "") : Date.parse(b.updatedAt) - Date.parse(a.updatedAt)))
}

export function ScheduledPostsPanel({
  head,
  initial,
  onCompose,
  onEdit,
  onOpenPost,
  control,
}: {
  head: CommunityHead
  /** Read on the server with the page (round 33); null or left out, the panel reads itself. */
  initial?: Loaded | null
  /** Schedule a post: the composer, its day and time on (round 26). Left out, no button. */
  onCompose?: () => void
  /** A draft or scheduled post opened in the composer to change. */
  onEdit?: (row: ScheduledPostView) => void
  /** A posted one: its post, over the admin. */
  onOpenPost?: (postId: string) => void
  control?: React.MutableRefObject<ScheduledPanelControl | null>
}) {
  const allowed = head.can.post === true
  const [data, setData] = React.useState<Loaded | null>(() => initial ?? KEPT.get(head.id) ?? null)
  const [loadError, setLoadError] = React.useState<string | null>(null)

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

  /* The composer saved one: it is in the list at once, then the list is read again quietly (another person's change too). */
  React.useEffect(() => {
    if (!control) return
    const change = (fn: (rows: ScheduledPostView[]) => ScheduledPostView[]) => {
      setData((d) => {
        if (!d) return d
        const next = { ...d, rows: orderScheduled(fn(d.rows)) }
        KEPT.set(head.id, next)
        return next
      })
      void load()
    }
    control.current = {
      put: (post) => change((rows) => [post, ...rows.filter((r) => r.id !== post.id)]),
      drop: (id) => change((rows) => rows.filter((r) => r.id !== id)),
    }
    return () => {
      control.current = null
    }
  }, [control, head.id, load])

  if (!allowed) return null
  if (loadError && !data) return <Notice>{loadError}</Notice>
  if (!data) return <ScheduledFrame />

  const waiting = data.rows.filter((r) => r.status === "scheduled" || r.status === "publishing")
  const drafts = data.rows.filter((r) => r.status === "draft")
  const recent = data.rows.filter((r) => r.status === "published" || r.status === "failed")
  const spaces = data.spaces

  const row = (r: ScheduledPostView) => {
    const s = STATUS[r.status]
    const editable = !!onEdit && r.mine && EDITABLE.includes(r.status)
    const due = r.status === "scheduled" && !!r.publishAt && Date.parse(r.publishAt) <= Date.now()
    const line =
      r.status === "publishing" || due
        ? tt("Going up now")
        : r.status === "scheduled"
          ? tt("Goes up {value}", { value: whenWords(r.publishAt) })
          : r.status === "published"
            ? tt("Posted {value}", { value: whenWords(r.publishedAt) })
            : r.status === "failed"
              ? r.error || tt("It did not go up.")
              : tt("Edited {value}", { value: relativeTime(r.updatedAt) })
    const words = r.title || r.body.split("\n")[0] || tt("Untitled")
    const opensPost = r.status === "published" && !!r.postId && !!onOpenPost
    const go = () => {
      if (opensPost) onOpenPost(r.postId!)
      else if (editable) onEdit(r)
    }
    const pressable = editable || opensPost
    return (
      <li key={r.id} onClick={pressable ? rowPress(go) : undefined} className={cn("flex min-h-[60px] items-center gap-3 py-2.5", pressable && cn(ROW_PRESS, "-mx-4 px-4 sm:-mx-5 sm:px-5"))} data-scheduled-row={r.status} data-scheduled-id={r.id}>
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
          <p className={cn("mt-1 truncate text-[13px]", r.status === "failed" ? "text-[#b42318]" : "text-[#6b7280]")} data-scheduled-line="">
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

  return (
    <Section
      title={tt("Scheduled and drafts")}
      hint={tt("Write a post now and choose when it goes up, or keep it as a draft.")}
      action={
        data.ready && spaces.length && onCompose ? (
          <button type="button" onClick={onCompose} className={buttonPrimary} data-scheduled-new="">
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
    </Section>
  )
}
