"use client"

/**
 * ===========================================================================
 *  ANALYTICS
 * ===========================================================================
 * The last 30 or 90 days of a community, from the rows the nightly rollup
 * wrote (community_daily_stats), with today so far counted live beside
 * them. Each chart is one measure on its own axis, a single series named by
 * its title, in the violet the Analytics reports use, with a tooltip on
 * every day. Nothing is drawn that was not counted.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import type { AnalyticsView, CommunityHead } from "./view-types"
import { Notice, Segmented, card, errorText, send } from "./parts"

const LINE = "#8b5cf6"

function dayLabel(day: string, withYear = false): string {
  const t = Date.parse(`${day}T12:00:00Z`)
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(t)
}

/** A nice top for the axis: 1, 2 or 5 times a power of ten, at least the largest value. */
function niceMax(v: number): number {
  if (v <= 4) return 4
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p
  return 10 * p
}

/** One measure per day: bars for counts that happen, a line for a level that persists. */
export function DayChart({ points, kind, name }: { points: { day: string; value: number }[]; kind: "bars" | "line"; name: string }) {
  const [hover, setHover] = React.useState<number | null>(null)
  /* Drawn at the width it is shown at, so the axis words are 11px on every screen rather than shrunk with the picture. */
  const box = React.useRef<HTMLDivElement>(null)
  const [W, setW] = React.useState(640)
  React.useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const read = () => setW(Math.max(240, Math.round(el.getBoundingClientRect().width)))
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = 176
  const pad = { l: 46, r: 8, t: 10, b: 22 }
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)))
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const n = Math.max(1, points.length)
  const step = iw / n
  const x = (i: number) => pad.l + step * i + step / 2
  const y = (v: number) => pad.t + ih - (v / max) * ih
  const ticks = [0, max / 2, max]
  const labelEvery = Math.ceil(n / Math.max(3, Math.floor(W / 90)))
  const bw = Math.max(2, Math.min(18, step - 2))
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("")
  const h = hover !== null ? points[hover] : null

  return (
    <div ref={box} className="relative" data-chart={name}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full touch-pan-y select-none"
        role="img"
        aria-label={`${name}, ${points.length} days`}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const px = ((e.clientX - r.left) / r.width) * W
          const i = Math.floor((px - pad.l) / step)
          setHover(i >= 0 && i < n ? i : null)
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#eef0f2" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize="11" fill="#9ca3af" className="tabular-nums">
              {Number.isInteger(t) ? t.toLocaleString("en-US") : t.toFixed(1)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={p.day} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="#9ca3af">
              {dayLabel(p.day)}
            </text>
          ) : null,
        )}
        {kind === "bars"
          ? points.map((p, i) => {
              const top = y(p.value)
              const height = pad.t + ih - top
              return height > 0 ? <path key={p.day} d={`M${x(i) - bw / 2},${pad.t + ih}V${top + Math.min(4, height)}q0,-${Math.min(4, height)} ${Math.min(4, bw / 2)},-${Math.min(4, height)}H${x(i) + bw / 2 - Math.min(4, bw / 2)}q${Math.min(4, bw / 2)},0 ${Math.min(4, bw / 2)},${Math.min(4, height)}V${pad.t + ih}Z`} fill={LINE} opacity={hover === null || hover === i ? 1 : 0.45} /> : null
            })
          : (
            <path d={path} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          )}
        {hover !== null && h ? (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="#c9ccd2" strokeWidth={1} strokeDasharray="3 3" />
            {kind === "line" ? <circle cx={x(hover)} cy={y(h.value)} r={4.5} fill={LINE} stroke="#fff" strokeWidth={2} /> : null}
          </g>
        ) : null}
      </svg>
      {h && hover !== null ? (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-[#e5e7eb] bg-white px-2.5 py-1.5 text-[12px] shadow-[0_6px_18px_-6px_rgba(17,24,39,0.2)]"
          style={{ left: `${Math.min(88, Math.max(12, (x(hover) / W) * 100))}%` }}
        >
          <span className="text-[#6b7280]">{dayLabel(h.day, true)}</span> <span className="font-semibold tabular-nums text-[#1a1a2e]">{h.value.toLocaleString("en-US")}</span>
        </div>
      ) : null}
    </div>
  )
}

function ChartCard({ title, total, children }: { title: string; total?: string; children: React.ReactNode }) {
  return (
    <section className={cn(card, "px-4 pb-3 pt-4 sm:px-5")}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-[14px] font-semibold text-[#1a1a2e]">{title}</h2>
        {total ? <p className="text-[13px] tabular-nums text-[#6b7280]">{total}</p> : null}
      </div>
      {children}
    </section>
  )
}

export function AnalyticsSection({ head, initial }: { head: CommunityHead; initial: AnalyticsView }) {
  const [data, setData] = React.useState(initial)
  const [days, setDays] = React.useState<"30" | "90">(String(initial.days) === "90" ? "90" : "30")
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  const choose = async (d: "30" | "90") => {
    setDays(d)
    setLoading(true)
    const res = await send<AnalyticsView>(`/api/app/community/${head.id}/analytics?days=${d}`, "GET")
    setLoading(false)
    if (!res.ok) return setError(errorText(res.data.error, "The figures could not be loaded."))
    setError(null)
    setData(res.data)
  }

  const t = data.totals
  const tiles = [
    { label: "Members now", value: data.live.members, sub: data.live.newToday ? `${data.live.newToday} joined today` : "None joined today yet" },
    { label: "Joined", value: t.newMembers, sub: `${t.left} left` },
    { label: "Posts", value: t.posts, sub: `${data.live.postsToday} today` },
    { label: "Comments", value: t.comments, sub: `${data.live.commentsToday} today` },
    { label: "Reactions", value: t.reactions },
    { label: "RSVPs", value: t.rsvps },
  ]

  return (
    <div className="space-y-4" data-analytics="" aria-busy={loading || undefined}>
      <div className="flex items-center justify-between gap-3">
        <Segmented value={days} onChange={(d) => void choose(d)} label="Period" options={[{ value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} />
        <p className="text-[12.5px] text-[#9ca3af] max-sm:hidden">Up to yesterday, plus today so far</p>
      </div>
      {error ? <Notice>{error}</Notice> : null}
      {!data.rolledUp ? <Notice tone="info">The daily figures start after the first nightly count. Today&rsquo;s numbers below are live.</Notice> : null}

      <section className={cn(card, "overflow-hidden")} aria-label="Totals">
        <div className="grid grid-cols-2 gap-px bg-[#f1f2f4] sm:grid-cols-3 lg:grid-cols-6">
          {tiles.map((x) => (
            <div key={x.label} className="bg-white px-4 py-3.5">
              <p className="truncate text-[12.5px] font-medium text-[#6b7280]">{x.label}</p>
              <p className="mt-1 text-[22px] font-semibold leading-7 tabular-nums text-[#1a1a2e]">{x.value.toLocaleString("en-US")}</p>
              {x.sub ? <p className="mt-0.5 truncate text-[12px] text-[#9ca3af]">{x.sub}</p> : null}
            </div>
          ))}
        </div>
      </section>

      {data.rolledUp ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Members">
            <DayChart points={data.series.members} kind="line" name="Members" />
          </ChartCard>
          <ChartCard title="Active members" total="who visited that day">
            <DayChart points={data.series.activeMembers} kind="line" name="Active members" />
          </ChartCard>
          <ChartCard title="New members" total={`${t.newMembers.toLocaleString("en-US")} in ${data.days} days`}>
            <DayChart points={data.series.newMembers} kind="bars" name="New members" />
          </ChartCard>
          <ChartCard title="Posts" total={`${t.posts.toLocaleString("en-US")} in ${data.days} days`}>
            <DayChart points={data.series.posts} kind="bars" name="Posts" />
          </ChartCard>
        </div>
      ) : null}

      <section className={cn(card, "px-4 py-4 sm:px-5")}>
        <h2 className="text-[14px] font-semibold text-[#1a1a2e]">Most liked posts</h2>
        {data.topPosts.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-[#6b7280]">No reactions or comments in this period yet.</p>
        ) : (
          <ol className="mt-2 divide-y divide-[#f1f2f4]">
            {data.topPosts.map((p, i) => (
              <li key={p.id} className="flex min-h-11 items-center gap-3 py-0.5">
                <span className="w-5 shrink-0 text-[13px] tabular-nums text-[#9ca3af]">{i + 1}</span>
                <a href={`/community/${head.slug}/post/${p.id}`} target="_blank" rel="noopener noreferrer" className="flex min-h-10 min-w-0 flex-1 items-center truncate text-[14px] text-[#1a1a2e] hover:underline">
                  {p.title}
                </a>
                <span className="shrink-0 text-[12.5px] tabular-nums text-[#6b7280]">
                  {p.reactions} {p.reactions === 1 ? "like" : "likes"} · {p.comments} {p.comments === 1 ? "comment" : "comments"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
