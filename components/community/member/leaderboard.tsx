"use client"

/**
 * THE LEADERBOARD: who earned the most points in the last 7 or 30 days, or
 * ever. Every number is a sum of real point rows (lib/communities/server/
 * points.ts); ties share a rank. Beside it, the community's levels and where
 * the viewer stands.
 */
import Link from "next/link"
import { useState } from "react"
import { AppAvatar } from "@/components/app/app-avatar"
import { api, apiBase } from "./api"
import { PageTitle } from "./headers"
import { toast } from "./toast"
import { CARD } from "./ui"
import type { LeaderboardRow } from "./view-types"

type Period = "7d" | "30d" | "all"
const PERIODS: { key: Period; label: string }[] = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All time" },
]

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
    if (p === period) return
    setPeriod(p)
    setLoading(true)
    const r = await api<{ entries: LeaderboardRow[] }>(`${apiBase(communityId)}/leaderboard?period=${p}`)
    setLoading(false)
    if (!r.ok) return toast(r.error)
    setRows(r.data.entries)
  }
  const myLevel = levels.find((l) => l.level === me.level)
  return (
    <div className="flex gap-6 pb-16 pt-2 lg:pt-6" data-leaderboard="">
      <div className="w-full min-w-0 max-w-[680px] flex-1">
        <PageTitle title="Leaderboard" detail="Points come from likes on your posts and comments." />
        <div className="inline-flex rounded-full border border-[#e3e4e8] bg-white p-1" role="tablist" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={period === p.key}
              onClick={() => choose(p.key)}
              className={`h-10 rounded-full px-3.5 sm:h-9 text-[13.5px] font-medium transition-colors ${period === p.key ? "bg-[#1a1a2e] text-white" : "text-[#6b7280] hover:text-[#1a1a2e]"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <ol className={`${CARD} mt-4 divide-y divide-[#f0f1f3] overflow-hidden transition-opacity ${loading ? "opacity-60" : ""}`} data-leaderboard-list="">
          {rows.map((r) => (
            <li key={r.userId}>
              <Link href={`/community/${slug}/members/${r.userId}`} className={`flex min-h-[60px] items-center gap-3 px-4 py-2.5 hover:bg-[#f8f9fa] sm:px-5 ${r.userId === me.userId ? "bg-[#f8f9fa]" : ""}`}>
                <span className={`w-7 shrink-0 text-center text-[15px] font-semibold tabular-nums ${r.rank <= 3 ? "text-[#1a1a2e]" : "text-[#9ca3af]"}`}>{r.rank}</span>
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
          {rows.length === 0 ? <li className="px-5 py-10 text-center text-[14px] text-[#6b7280]">No points earned {period === "all" ? "yet" : "in this period"}.</li> : null}
        </ol>
      </div>
      <aside className="hidden w-[248px] shrink-0 xl:block">
        <div className={`${CARD} sticky top-[calc(var(--community-top,0px)+24px)] p-4`}>
          <p className="text-[12.5px] font-medium text-[#8a8f98]">You</p>
          <p className="mt-1 text-[15px] font-semibold text-[#1a1a2e]">
            Level {me.level}
            {myLevel ? ` · ${myLevel.name}` : ""}
          </p>
          <p className="text-[13px] tabular-nums text-[#6b7280]">{me.points} points</p>
          {levels.length ? (
            <ol className="mt-4 space-y-1.5 border-t border-[#f0f1f3] pt-3">
              {levels.map((l) => (
                <li key={l.level} className={`flex items-center gap-2 text-[13px] ${l.level === me.level ? "font-semibold text-[#1a1a2e]" : "text-[#6b7280]"}`}>
                  <span className="w-5 tabular-nums">{l.level}</span>
                  <span className="truncate">{l.name}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
