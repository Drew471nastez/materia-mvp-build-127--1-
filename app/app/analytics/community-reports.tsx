"use client"

/**
 * ===========================================================================
 *  COMMUNITIES, ON THE SELLER'S ANALYTICS
 * ===========================================================================
 * A seller who runs a community sees it here beside everything else they
 * sell: for each one (published or archived; a draft has had no visitor),
 * its members now, who joined in the period and its visits, with the
 * comparison the rest of the page uses, and a link to the community's own
 * Analytics for everything else (app/app/community/[id]/analytics).
 *
 * Counted where a community counts itself: app/api/app/community/<id>/
 * analytics with the page's own period, comparison and time zone
 * (lib/communities/server/analytics-report). A community's visits are its
 * own beacon's (lib/communities/server/record-view: one a visitor a day),
 * not the page views above, so they are never added to them.
 *
 * Drawn on the first paint with every row's name; only the numbers wait.
 */
import * as React from "react"
import { ReportBody, ReportCard, ReportChange } from "./analytics-reports"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { AppLink } from "@/components/app/app-link"

export interface CommunityPlace {
  id: string
  name: string
  slug?: string | null
}

interface Figure {
  value: number | null
  previous: number | null
}
interface CommunityAnswer {
  figures?: { members?: Figure; joined?: Figure; visits?: Figure }
  live?: { members?: number }
}

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "–" : Math.round(n).toLocaleString(appLocale()))
const headline = (f: Figure | undefined) => {
  const value = f?.value ?? 0
  const previous = f?.previous ?? 0
  return { value, previous, change: previous === 0 ? null : (value - previous) / previous }
}

export function CommunityReports({
  communities,
  span,
  compare,
  timeZone,
  refresh = 0,
}: {
  communities: CommunityPlace[]
  span: { start: number; end: number }
  compare: { start: number; end: number } | null
  timeZone: string
  refresh?: number
}) {
  const [answers, setAnswers] = React.useState<Record<string, CommunityAnswer | "failed">>({})
  const [question, setQuestion] = React.useState("")
  const ask = `${span.start}|${span.end}|${compare?.start ?? ""}|${compare?.end ?? ""}|${timeZone}`
  React.useEffect(() => {
    let live = true
    const q = new URLSearchParams({ start: new Date(span.start).toISOString(), end: new Date(span.end).toISOString(), tz: timeZone })
    if (compare) {
      q.set("cstart", new Date(compare.start).toISOString())
      q.set("cend", new Date(compare.end).toISOString())
    }
    for (const c of communities.slice(0, 6)) {
      fetch(`/api/app/community/${encodeURIComponent(c.id)}/analytics?${q}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: CommunityAnswer) => {
          if (!live) return
          setAnswers((a) => ({ ...a, [c.id]: d }))
          setQuestion(ask)
        })
        .catch(() => live && setAnswers((a) => ({ ...a, [c.id]: a[c.id] && a[c.id] !== "failed" ? a[c.id] : "failed" })))
    }
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask, refresh, communities.map((c) => c.id).join(",")])

  const shown = communities.slice(0, 6)
  const blank = shown.every((c) => !answers[c.id])
  return (
    <ReportCard
      card="communities"
      title={tt("Communities")}
      help={tt("Each community's members now, who joined in this period and its visits, one a visitor a day. Open a community for its full analytics.")}
      className={question && question !== ask ? "opacity-60 transition-opacity duration-300" : "transition-opacity duration-300"}
    >
      <ReportBody blank={blank} wait="list">
        <div className="flex h-full flex-col">
          <div className="flex h-7 items-center gap-2 text-[11.5px] font-medium text-[#9ca3af]">
            <span className="min-w-0 flex-1" />
            <span className="w-14 text-right">{tt("Members")}</span>
            <span className="w-14 text-right">{tt("Joined")}</span>
            <span className="w-14 text-right">{tt("Visits")}</span>
          </div>
          <ol className="divide-y divide-[#f1f2f4]">
            {shown.map((c) => {
              const a = answers[c.id]
              const d = a && a !== "failed" ? a : null
              const joined = headline(d?.figures?.joined)
              return (
                <li key={c.id} data-community={c.id} className="flex h-12 items-center gap-2 text-[13px]">
                  <span className="min-w-0 flex-1">
                    <AppLink href={`/app/community/${c.id}/analytics`} className="block truncate font-medium text-[#1a1a2e] hover:underline">
                      {c.name}
                    </AppLink>
                    <span className="block h-4 truncate text-[12px] text-[#9ca3af]">{a === "failed" ? tt("Could not be read") : d && joined.change !== null ? (
                      <span className="inline-flex items-baseline gap-1.5">
                        {tt("Joins")}
                        <ReportChange h={joined} />
                      </span>
                    ) : null}</span>
                  </span>
                  <span className="w-14 text-right tabular-nums text-[#1a1a2e]">{d ? fmt(d.live?.members ?? d.figures?.members?.value) : ""}</span>
                  <span className="w-14 text-right tabular-nums text-[#1a1a2e]">{d ? fmt(d.figures?.joined?.value) : ""}</span>
                  <span className="w-14 text-right tabular-nums text-[#1a1a2e]">{d ? fmt(d.figures?.visits?.value) : ""}</span>
                </li>
              )
            })}
          </ol>
        </div>
      </ReportBody>
    </ReportCard>
  )
}
