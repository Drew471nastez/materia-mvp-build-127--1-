"use client"

/**
 * THE LEADERBOARD: who earned the most points in the last 7 or 30 days, or
 * ever. Every number is a sum of real point rows (lib/communities/server/
 * points.ts); ties share a rank. On a wide screen the list uses the middle
 * column; levels and the viewer's standing sit in one aside (the wall's
 * duplicate top-three card is hidden on this page).
 */
import Link from "next/link"
import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { api, apiBase } from "./api"
import { PageTitle } from "./headers"
import { toast } from "./toast"
import { CARD } from "./ui"
import { memberHref } from "./person-href"
import type { LeaderboardRow } from "./view-types"

type Period = "7d" | "30d" | "all"
const PERIODS: { key: Period; label: string; short: string }[] = [
  { key: "7d", label: "7 days", short: "7d" },
  { key: "30d", label: "30 days", short: "30d" },
  { key: "all", label: "All time", short: "All" },
]

function periodLabel(p: Period): string {
  return PERIODS.find((x) => x.key === p)?.label ?? ""
}

function PeriodSelectDesktop({ period, loading, onChoose }: { period: Period; loading: boolean; onChoose: (p: Period) => void }) {
  return (
    <label className="relative shrink-0">
      <span className="sr-only">Time period</span>
      <select
        value={period}
        disabled={loading}
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

function PeriodSegmentsMobile({ period, loading, onChoose }: { period: Period; loading: boolean; onChoose: (p: Period) => void }) {
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
            disabled={loading}
            onClick={() => onChoose(p.key)}
            className={`h-9 min-w-0 flex-1 rounded-[8px] text-[13px] font-semibold transition-[background-color,color,box-shadow] disabled:opacity-60 ${on ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "text-[#6b7280]"}`}
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
  const choose = async (p: Period) => {
    if (p === period || loading) return
    setPeriod(p)
    setLoading(true)
    const r = await api<{ entries: LeaderboardRow[] }>(`${apiBase(communityId)}/leaderboard?period=${p}`)
    setLoading(false)
    if (!r.ok) return toast(r.error)
    setRows(r.data.entries)
  }
  const myLevel = levels.find((l) => l.level === me.level)
  const myRow = me.userId ? rows.find((r) => r.userId === me.userId) : null
  return (
    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-8" data-leaderboard="">
      <div className="min-w-0 flex-1">
        <PageTitle title="Leaderboard" detail="Points come from likes on your posts and comments.">
          <div className="hidden sm:block">
            <PeriodSelectDesktop period={period} loading={loading} onChoose={choose} />
          </div>
        </PageTitle>
        <div className="mb-3 sm:hidden">
          <PeriodSegmentsMobile period={period} loading={loading} onChoose={choose} />
        </div>
        <p className="mb-3 hidden text-[13px] text-[#8a8f98] sm:block" data-leaderboard-period-label="">
          Showing <span className="font-medium text-[#4b5563]">{periodLabel(period)}</span>
        </p>
        <ol className={`${CARD} divide-y divide-[#f0f1f3] overflow-hidden transition-opacity ${loading ? "pointer-events-none opacity-60" : ""}`} data-leaderboard-list="" aria-busy={loading}>
          {rows.map((r) => (
            <li key={r.userId}>
              <Link
                href={memberHref(slug, { id: r.userId, username: r.username, hasStorefront: r.hasStorefront })}
                data-person-link=""
                data-person-id={r.userId}
                className={`flex min-h-[60px] items-center gap-3 px-4 py-2.5 hover:bg-[#f8f9fa] sm:px-5 ${r.userId === me.userId ? "bg-[#f8f9fa]" : ""}`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center text-[15px] font-semibold tabular-nums ${r.rank <= 3 ? "text-[#1a1a2e]" : "text-[#9ca3af]"}`}>{r.rank}</span>
                <AppAvatar src={r.avatarUrl} name={r.name} alt="" size={40} markWhileLoading />
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
      <aside className="min-w-0 xl:w-[260px] xl:shrink-0">
        <div className={`${CARD} xl:sticky xl:top-[calc(var(--community-top,0px)+24px)] p-4`} data-leaderboard-you="">
          <p className="text-[12.5px] font-medium uppercase tracking-[0.04em] text-[#8a8f98]">Your standing</p>
          <p className="mt-2 text-[17px] font-semibold text-[#1a1a2e]">
            Level {me.level}
            {myLevel ? ` · ${myLevel.name}` : ""}
          </p>
          <p className="mt-0.5 text-[14px] tabular-nums text-[#6b7280]">
            {myRow ? `${myRow.points} pts this period` : `${me.points} points total`}
          </p>
          {levels.length ? (
            <div className="mt-4 border-t border-[#f0f1f3] pt-3">
              <p className="text-[12.5px] font-medium text-[#8a8f98]">Levels</p>
              <ol className="mt-2 max-h-[min(320px,50vh)] space-y-1 overflow-y-auto pr-0.5 [-webkit-overflow-scrolling:touch]">
                {levels.map((l) => (
                  <li key={l.level} className={`flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-[13px] ${l.level === me.level ? "bg-[#f3f4f6] font-semibold text-[#1a1a2e]" : "text-[#6b7280]"}`}>
                    <span className="w-5 shrink-0 tabular-nums">{l.level}</span>
                    <span className="truncate">{l.name}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
