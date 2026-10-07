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
import { ChevronDown } from "lucide-react"
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

function PeriodSelectDesktop({ period, onChoose }: { period: Period; onChoose: (p: Period) => void }) {
  return (
    <label className="relative shrink-0">
      <span className="sr-only">Time period</span>
      <select
        value={period}
        onChange={(e) => onChoose(e.target.value as Period)}
        className="h-10 min-w-[9.5rem] cursor-pointer appearance-none rounded-[10px] border border-[#e3e4e8] bg-white pl-3 pr-9 text-[14px] font-medium text-[#1a1a2e] shadow-[0_1px_1px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] hover:border-[#d5d8de] focus-visible:border-[#1a1a2e]/25 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/10 disabled:cursor-wait disabled:opacity-60"
        data-leaderboard-period-select=""
      >
        {PERIODS.map((p) => (
          <option key={p.key} value={p.key}>{p.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" strokeWidth={2} aria-hidden />
    </label>
  )
}

function PeriodSegmentsMobile({ period, onChoose }: { period: Period; onChoose: (p: Period) => void }) {
  return (
    <div className="flex rounded-[10px] border border-[#e3e4e8] bg-[#f6f7f8] p-0.5" role="tablist" aria-label="Time period" data-leaderboard-period-tabs="">
      {PERIODS.map((p) => {
        const on = period === p.key
        return (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChoose(p.key)}
            className={`h-9 min-w-0 flex-1 touch-manipulation rounded-[8px] text-[13px] font-semibold transition-[background-color,color,box-shadow] duration-200 ${on ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "text-[#6b7280]"}`}
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
  const myRow = me.userId ? rows.find((r) => r.userId === me.userId) : null
  return (
    <div className="flex flex-col" data-leaderboard="">
      <PageTitle title="Leaderboard" detail="Points come from likes on your posts and comments.">
        <div className="hidden sm:block">
          <PeriodSelectDesktop period={period} onChoose={choose} />
        </div>
      </PageTitle>
      <div className="mb-3 sm:hidden">
        <PeriodSegmentsMobile period={period} onChoose={choose} />
      </div>
      <section className={`${CARD} mb-4 px-4 py-3.5 sm:px-5`} data-leaderboard-you="">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-[15px] font-semibold text-[#1a1a2e]">
            <span className="mr-2 text-[12.5px] font-medium text-[#8a8f98]">You</span>
            Level {me.level}
            {myLevel ? ` · ${myLevel.name}` : ""}
          </p>
          <p className="shrink-0 text-[14px] font-semibold tabular-nums text-[#1a1a2e]">
            {myRow ? myRow.points : me.points}
            <span className="ml-1 text-[12px] font-medium text-[#8a8f98]">{myRow ? `pts in ${periodLabel(period).toLowerCase()}` : "pts total"}</span>
          </p>
        </div>
        {levels.length ? (
          <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Levels" data-leaderboard-levels="">
            {levels.map((l) => {
              const mine = l.level === me.level
              const passed = l.level < me.level
              return (
                <li
                  key={l.level}
                  aria-current={mine ? "step" : undefined}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] ${mine ? "bg-[#1a1a2e] font-semibold text-white" : passed ? "bg-[#f1f2f4] text-[#4b5563]" : "border border-[#e5e7eb] text-[#8a8f98]"}`}
                >
                  <span className="tabular-nums">{l.level}</span>
                  <span>{l.name}</span>
                </li>
              )
            })}
          </ol>
        ) : null}
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
