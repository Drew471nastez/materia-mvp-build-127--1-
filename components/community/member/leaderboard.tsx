"use client"

/**
 * THE LEADERBOARD: who earned the most points in the last 7 or 30 days, or
 * ever. Every number is a sum of real point rows (lib/communities/server/
 * points.ts); ties share a rank. One column at every width: the viewer's
 * standing and the levels in one short card over the list, so the list
 * and its title have the whole middle column on a computer. Each period is
 * kept once read and the other two are read ahead, so a switch is instant.
 */
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { MemberAvatar, warmMemberFaces } from "./member-avatar"
import { api, apiBase } from "./api"
import { PageTitle } from "./headers"
import { toast } from "./toast"
import { CARD } from "./ui"
import { memberHref } from "./person-href"
import type { LeaderboardRow } from "./view-types"
import { useCommunityPullListener } from "./community-pull-refresh"
import { COMMUNITY_LEADERBOARD_REFRESH_SCOPE } from "@/lib/communities/refresh-scope"

type Period = "7d" | "30d" | "all"
const PERIODS: { key: Period; label: string; short: string }[] = [
  { key: "7d", label: "7 days", short: "7d" },
  { key: "30d", label: "30 days", short: "30d" },
  { key: "all", label: "All time", short: "All" },
]

function periodLabel(p: Period): string {
  return PERIODS.find((x) => x.key === p)?.label ?? ""
}

/** The period, as one small segmented control at every width (round 15: the select was too big for what it does). */
function PeriodSwitch({ period, onChoose }: { period: Period; onChoose: (p: Period) => void }) {
  return (
    <div className="inline-flex shrink-0 rounded-[11px] bg-[#eef0f2] p-0.5 sm:rounded-[9px]" role="tablist" aria-label="Time period" data-leaderboard-period-tabs="">
      {PERIODS.map((p) => {
        const on = period === p.key
        return (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={on}
            title={p.label}
            onClick={() => onChoose(p.key)}
            className={`h-10 min-w-[48px] touch-manipulation rounded-[9px] px-3 sm:h-7 sm:min-w-[44px] sm:rounded-[7px] sm:px-2.5 text-[12.5px] font-semibold outline-none transition-[background-color,color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 ${on ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.1)]" : "text-[#6b7280] hover:text-[#1a1a2e]"}`}
          >
            {p.short}
          </button>
        )
      })}
    </div>
  )
}

export function Leaderboard({
  communityId,
  slug,
  initial,
  me,
  levels,
}: {
  communityId: string
  slug: string
  initial: LeaderboardRow[]
  me: { userId: string | null; points: number; level: number }
  levels: { level: number; name: string }[]
}) {
  const [period, setPeriod] = useState<Period>("30d")
  const [rows, setRows] = useState(initial)
  const [loading, setLoading] = useState(false)
  /* Every period read once is kept, so switching back is instant; the other two are read ahead while the page is idle. */
  const cache = useRef<Map<Period, LeaderboardRow[]>>(new Map([["30d", initial]]))
  const wantedRef = useRef<Period>("30d")
  useEffect(() => {
    warmMemberFaces(rows, 40, 40)
  }, [rows])
  const read = useCallback(
    async (p: Period): Promise<LeaderboardRow[] | null> => {
      const r = await api<{ entries: LeaderboardRow[] }>(`${apiBase(communityId)}/leaderboard?period=${p}`)
      if (!r.ok) return null
      cache.current.set(p, r.data.entries)
      return r.data.entries
    },
    [communityId],
  )
  useEffect(() => {
    const ahead = () => {
      for (const p of ["7d", "all"] as Period[]) if (!cache.current.has(p)) void read(p).then((e) => e && warmMemberFaces(e, 40, 40))
    }
    const w = window as unknown as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(ahead, { timeout: 1500 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(ahead, 600)
    return () => window.clearTimeout(t)
  }, [read])
  const choose = async (p: Period) => {
    if (p === wantedRef.current) return
    wantedRef.current = p
    setPeriod(p)
    const kept = cache.current.get(p)
    if (kept) {
      setRows(kept)
      setLoading(false)
      /* Still read again quietly, so a count that moved is right a moment later. */
      void read(p).then((e) => {
        if (e && wantedRef.current === p) setRows(e)
      })
      return
    }
    setLoading(true)
    const e = await read(p)
    if (wantedRef.current !== p) return
    setLoading(false)
    if (!e) return toast("Could not load the leaderboard. Try again.")
    setRows(e)
  }
  const pullRefresh = useCallback(async () => {
    const p = wantedRef.current
    const e = await read(p)
    if (e && wantedRef.current === p) setRows(e)
  }, [read])
  useCommunityPullListener(COMMUNITY_LEADERBOARD_REFRESH_SCOPE, pullRefresh)
  const myLevel = levels.find((l) => l.level === me.level)
  const nextLevel = levels.find((l) => l.level === me.level + 1) ?? null
  const myRow = me.userId ? rows.find((r) => r.userId === me.userId) : null
  return (
    <div className="flex flex-col" data-leaderboard="">
      <PageTitle title="Leaderboard" detail="Points come from likes on your posts and comments.">
        <PeriodSwitch period={period} onChoose={choose} />
      </PageTitle>
      {/* Where you stand, in one line: your level, your points in this period, and the level after yours (round 15). */}
      <section className={`${CARD} mb-3 flex items-center gap-3 px-4 py-3 sm:px-5`} data-leaderboard-you="">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1a1a2e] text-[14px] font-semibold tabular-nums text-white" aria-hidden>
          {me.level}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold text-[#1a1a2e]">
            Level {me.level}
            {myLevel ? ` · ${myLevel.name}` : ""}
          </p>
          <p className="truncate text-[12.5px] text-[#6b7280]" data-leaderboard-next="">
            {nextLevel ? `Next: ${nextLevel.name}` : levels.length ? "The top level" : "Your level"}
          </p>
        </div>
        <p className="shrink-0 text-right text-[15px] font-semibold tabular-nums text-[#1a1a2e]">
          {myRow ? myRow.points : me.points}
          <span className="block text-[11.5px] font-medium text-[#8a8f98]">{myRow ? periodLabel(period).toLowerCase() : "points in all"}</span>
        </p>
      </section>
      <ol className={`${CARD} divide-y divide-[#f0f1f3] overflow-hidden transition-opacity duration-200 ${loading ? "opacity-60" : ""}`} data-leaderboard-list="" aria-busy={loading}>
        {rows.map((r) => (
          <li key={r.userId}>
            <Link
              href={memberHref(slug, { id: r.userId, username: r.username, hasStorefront: r.hasStorefront })}
              data-person-link=""
              data-person-id={r.userId}
              className={`flex min-h-[60px] items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-[#f8f9fa] sm:px-5 ${r.userId === me.userId ? "bg-[#f8f9fa]" : ""}`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center text-[15px] font-semibold tabular-nums ${r.rank <= 3 ? "text-[#1a1a2e]" : "text-[#9ca3af]"}`}>{r.rank}</span>
              <MemberAvatar src={r.avatarUrl} name={r.name} alt="" size={40} warm={false} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-[#1a1a2e]">
                  {r.name}
                  {r.userId === me.userId ? <span className="ml-1.5 text-[12.5px] font-medium text-[#6b7280]">You</span> : null}
                </span>
                <span className="block truncate text-[12.5px] text-[#6b7280]">
                  Level {r.level}
                  {r.levelName ? ` · ${r.levelName}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-[14px] font-semibold tabular-nums text-[#1a1a2e]">
                {r.points}
                <span className="ml-1 text-[12px] font-medium text-[#8a8f98]">pts</span>
              </span>
            </Link>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="px-5 py-10 text-center text-[14px] text-[#6b7280]">No points earned {period === "all" ? "yet" : "in this period"}.</li>
        ) : null}
      </ol>
    </div>
  )
}
