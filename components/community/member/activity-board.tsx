"use client"

/**
 * ===========================================================================
 *  A MEMBER'S ACTIVITY HERE, ON THEIR PROFILE
 * ===========================================================================
 * Round 18 (C18, item 11), the owner: "an activity board, very smooth and
 * clean, with days ... like Skool has, and it needs to be tracked; it can
 * also show the member's level". One card under the profile's head, in
 * Storelib's look (white, a hairline, the near black ink), drawn from what
 * the server counted (lib/communities/member-activity.ts MemberBoard):
 *
 *   STANDING   where the community counts points: their level (the number in
 *              the dark disc the leaderboard uses), its name, their points
 *              and how far they are to the next level, as a thin bar.
 *   FACTS      their posts and comments here, all time, and when they
 *              joined. A count the server could not make is left out, never
 *              shown as a zero.
 *   THE DAYS   one square a day for the last year, Sunday at the top, the
 *              newest week on the right, shaded in four fixed steps by what
 *              they did here that day (posts, comments, likes). Pressing or
 *              hovering a square says what it holds in the line under the
 *              grid, which is one fixed line, so nothing moves. On a phone
 *              the year is wider than the card, so the row scrolls sideways
 *              and starts at today (a reversed row starts at its end, with no
 *              script and no jump on the first frame); the edge it can be
 *              scrolled toward fades.
 *
 * Before SQL part 125 has run there is no grid (the server sends none), and
 * the card is the standing and the facts.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { TIME_ZONE_COOKIE, rememberTimeZone, viewerTimeZone } from "@/lib/orders/time-zone"
import {
  boardSummary,
  boardTally,
  boardWeeks,
  cellLabel,
  levelProgress,
  type ActivityGrid,
  type BoardCell,
  type MemberBoard,
  type MemberStanding,
} from "@/lib/communities/member-activity"
import { cn } from "@/lib/utils"

/** The card every block of the profile sits on (member-profile.tsx CARD). */
const CARD = "rounded-2xl border border-[#eceef1] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"

/** The day names' column. The squares and the gap between them are BOARD_CSS's (--ab-cell, --ab-gap). */
export const DAY_LABELS_PX = 26

/**
 * THE SQUARES' SHADES, light and dark. Ink over the card's own white, so the
 * steps read the same on any screen; the dark community (community-theme.css)
 * gets the same steps in its light ink. Printed with the board, so no
 * stylesheet has to carry them.
 */
const BOARD_CSS = `
[data-activity-board]{--ab-0:#eef0f3;--ab-1:rgba(26,26,46,.2);--ab-2:rgba(26,26,46,.42);--ab-3:rgba(26,26,46,.66);--ab-4:#1a1a2e;--ab-ring:#1a1a2e;--ab-track:#eef0f3}
[data-community-theme="dark"] [data-activity-board]{--ab-0:#242833;--ab-1:rgba(244,245,247,.2);--ab-2:rgba(244,245,247,.4);--ab-3:rgba(244,245,247,.64);--ab-4:#f4f5f7;--ab-ring:#f4f5f7;--ab-track:#242833}
[data-activity-cell]{background:var(--ab-0);transition:box-shadow 120ms ease-out}
[data-activity-cell="1"]{background:var(--ab-1)}[data-activity-cell="2"]{background:var(--ab-2)}[data-activity-cell="3"]{background:var(--ab-3)}[data-activity-cell="4"]{background:var(--ab-4)}
[data-activity-cell][data-picked]{box-shadow:0 0 0 1.5px var(--ab-ring)}
[data-activity-card]{--ab-cell:12px;--ab-gap:3px}
@media (min-width:640px){[data-activity-card]{--ab-gap:2px;--ab-cell:clamp(8px,calc((100cqw - 40px - 26px - 102px) / 52),13px)}}
[data-activity-days]{scrollbar-width:none;-webkit-overflow-scrolling:touch}
[data-activity-days]::-webkit-scrollbar{display:none}
[data-activity-days][data-more-before]{-webkit-mask-image:linear-gradient(to right,transparent 0,#000 28px);mask-image:linear-gradient(to right,transparent 0,#000 28px)}
`

const compact = (n: number) => (n < 10_000 ? n.toLocaleString("en-US") : `${Math.round(n / 1000)}k`)

const monthYear = (iso: string | null) => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
}

/* ── Standing ─────────────────────────────────────────────────────────── */

function Standing({ s }: { s: MemberStanding }) {
  const progress = levelProgress(s)
  const toNext = s.next ? Math.max(0, s.next.minPoints - s.points) : 0
  return (
    <div className="px-4 pb-3.5 pt-4 sm:px-5" data-activity-standing="">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1a1a2e] text-[15px] font-semibold tabular-nums text-white" aria-hidden>
          {s.level}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-5 text-[#1a1a2e]" data-activity-level="">
            Level {s.level}
            {s.name ? <span className="font-medium text-[#6b7280]"> · {s.name}</span> : null}
          </p>
          <p className="mt-0.5 truncate text-[13px] leading-5 text-[#6b7280]" data-activity-next="">
            {s.next ? `${compact(toNext)} ${toNext === 1 ? "point" : "points"} to level ${s.next.level}${s.next.name ? ` · ${s.next.name}` : ""}` : "The top level here"}
          </p>
        </div>
        <p className="shrink-0 text-right text-[16px] font-semibold leading-5 tabular-nums text-[#1a1a2e]" data-activity-points="">
          {compact(s.points)}
          <span className="mt-0.5 block text-[12px] font-medium leading-4 text-[#8a8f98]">{s.points === 1 ? "point" : "points"}</span>
        </p>
      </div>
      <div
        className="mt-3 h-[5px] overflow-hidden rounded-full"
        style={{ background: "var(--ab-track)" }}
        role="progressbar"
        aria-label={s.next ? `Progress to level ${s.next.level}` : "Top level"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        data-activity-progress=""
      >
        <span className="block h-full origin-left rounded-full" style={{ background: "var(--ab-4)", scale: `${progress} 1` }} />
      </div>
    </div>
  )
}

/* ── Facts ────────────────────────────────────────────────────────────── */

function Facts({ board }: { board: MemberBoard }) {
  const joined = monthYear(board.joinedAt)
  const facts: { label: string; value: string; key: string }[] = []
  if (board.posts !== null) facts.push({ key: "posts", value: compact(board.posts), label: board.posts === 1 ? "Post" : "Posts" })
  if (board.comments !== null) facts.push({ key: "comments", value: compact(board.comments), label: board.comments === 1 ? "Comment" : "Comments" })
  if (joined) facts.push({ key: "joined", value: joined, label: "Joined" })
  if (!facts.length) return null
  return (
    <dl className="grid" style={{ gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))` }} data-activity-facts="">
      {facts.map((f, i) => (
        <div key={f.key} className={cn("flex min-w-0 flex-col-reverse items-center px-2 py-3", i ? "border-l border-[#eceef1]" : "")} data-activity-fact={f.key}>
          <dt className="truncate text-[12px] leading-4 text-[#6b7280]">{f.label}</dt>
          <dd className="truncate text-[15px] font-semibold leading-5 tabular-nums text-[#1a1a2e]">{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ── The days ─────────────────────────────────────────────────────────── */

const DAY_NAMES = ["", "Mon", "", "Wed", "", "Fri", ""]

function Days({ grid }: { grid: ActivityGrid }) {
  const weeks = useMemo(() => boardWeeks(grid), [grid])
  const byDay = useMemo(() => {
    const m = new Map<string, BoardCell>()
    for (const w of weeks) for (const c of w.cells) if (!c.future) m.set(c.day, c)
    return m
  }, [weeks])
  const [picked, setPicked] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement | null>(null)
  const pressed = useRef(false)

  /* The fade on the edge there is more to see behind: only while the row can still scroll that way. */
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const mark = () => {
      const more = el.scrollWidth - el.clientWidth - Math.abs(el.scrollLeft) > 2
      if (more) el.setAttribute("data-more-before", "")
      else el.removeAttribute("data-more-before")
    }
    mark()
    el.addEventListener("scroll", mark, { passive: true })
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(mark)
    ro?.observe(el)
    return () => {
      el.removeEventListener("scroll", mark)
      ro?.disconnect()
    }
  }, [])

  const cellAt = (target: EventTarget | null) => {
    const el = (target as Element | null)?.closest?.("[data-activity-cell]") as HTMLElement | null
    const day = el?.getAttribute("data-day")
    return day && byDay.has(day) ? day : null
  }
  const shown = picked ? byDay.get(picked) : null
  const line = shown ? cellLabel(shown, grid.today) : boardTally(grid)

  /* Arrow keys walk the days once the grid has focus: a day either side, a week up or down the row. */
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowLeft" ? -7 : e.key === "ArrowRight" ? 7 : e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0
    if (!step) return
    e.preventDefault()
    const from = picked ?? grid.today
    const at = new Date(Date.parse(`${from}T00:00:00Z`) + step * 86_400_000).toISOString().slice(0, 10)
    if (byDay.has(at)) setPicked(at)
  }

  return (
    <div className="px-4 pb-4 pt-3.5 sm:px-5" data-activity-grid="">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium leading-5 text-[#1a1a2e]">Last 12 months</p>
        <span className="flex shrink-0 items-center gap-[3px] text-[11px] leading-none text-[#8a8f98]" aria-hidden data-activity-legend="">
          <span className="mr-1">Less</span>
          {[0, 1, 2, 3, 4].map((s) => (
            <span key={s} className="block h-[10px] w-[10px] rounded-[2.5px]" data-activity-cell={s} />
          ))}
          <span className="ml-1">More</span>
        </span>
      </div>
      <div className="flex">
        {/* The day names, on the rows they name: the month row's height, then the squares'. */}
        <div className="shrink-0 pr-1 text-[10.5px] leading-none text-[#8a8f98]" style={{ width: DAY_LABELS_PX }} aria-hidden>
          <div className="h-[18px]" />
          <div className="flex flex-col" style={{ gap: "var(--ab-gap)" }}>
            {DAY_NAMES.map((d, i) => (
              <span key={i} className="flex items-center" style={{ height: "var(--ab-cell)" }}>
                {d}
              </span>
            ))}
          </div>
        </div>
        <div
          ref={scroller}
          className="flex min-w-0 flex-1 flex-row-reverse justify-start overflow-x-auto overscroll-x-contain outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
          style={{ gap: "var(--ab-gap)" }}
          role="img"
          aria-label={boardSummary(grid)}
          tabIndex={0}
          onKeyDown={onKey}
          onPointerDown={(e) => {
            pressed.current = true
            const day = cellAt(e.target)
            /* A second press on the same square lets it go; a press beside the squares lets any go. */
            setPicked((p) => (day && p !== day ? day : e.pointerType === "mouse" ? day : null))
          }}
          onPointerUp={() => {
            pressed.current = false
          }}
          onPointerMove={(e) => {
            if (e.pointerType !== "mouse") return
            const day = cellAt(e.target)
            if (day) setPicked(day)
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setPicked(null)
          }}
          onBlur={() => setPicked(null)}
          data-activity-days=""
        >
          {[...weeks].reverse().map((w) => (
            <div key={w.start} className="flex shrink-0 flex-col" style={{ gap: "var(--ab-gap)", width: "var(--ab-cell)" }} data-activity-week={w.start}>
              {/* The month a week starts, written from the column's left edge and allowed past it. */}
              <span className="relative h-[15px] text-[10.5px] leading-none text-[#8a8f98]" aria-hidden>
                {w.month ? <span className="absolute left-0 top-0 whitespace-nowrap">{w.month}</span> : null}
              </span>
              {w.cells.map((c) =>
                c.future ? (
                  <span key={c.day} className="block" style={{ height: "var(--ab-cell)" }} />
                ) : (
                  <span
                    key={c.day}
                    className="block rounded-[2.5px]"
                    style={{ height: "var(--ab-cell)" }}
                    data-activity-cell={c.shade}
                    data-day={c.day}
                    data-picked={picked === c.day ? "" : undefined}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2.5 min-w-0 truncate text-[12.5px] leading-5 text-[#6b7280]" aria-live="polite" data-activity-line="">
        {line}
      </p>
    </div>
  )
}

/* ── The board ────────────────────────────────────────────────────────── */

export function ActivityBoard({ board, name }: { board: MemberBoard; name: string }) {
  /* Days are counted in the zone the storelib_tz cookie names; a member who has never been in /app has none yet, so this device's is kept for the next read. */
  useEffect(() => {
    try {
      if (!document.cookie.split("; ").some((c) => c.startsWith(`${TIME_ZONE_COOKIE}=`))) rememberTimeZone(viewerTimeZone())
    } catch {
      /* A refused cookie: the days stay in UTC. */
    }
  }, [])
  const facts = <Facts board={board} />
  return (
    <section aria-label={`${name}'s activity`} data-activity-board="">
      <style>{BOARD_CSS}</style>
      <h2 className="mb-2.5 px-1 text-[15px] font-semibold text-[#1a1a2e]">Activity</h2>
      <div
        /* The square (BOARD_CSS): 12px on a phone, where the year scrolls; from 640px as large as lets the whole year fit, between 9 and 13px. */
        className={cn(CARD, "overflow-hidden [container-type:inline-size]")}
        data-activity-card=""
      >
        {board.standing ? <Standing s={board.standing} /> : null}
        {board.standing ? <div className="mx-4 h-px bg-[#eef0f3] sm:mx-5" aria-hidden /> : null}
        {facts}
        {board.grid ? (
          <>
            <div className="mx-4 h-px bg-[#eef0f3] sm:mx-5" aria-hidden />
            <Days grid={board.grid} />
          </>
        ) : null}
      </div>
    </section>
  )
}
