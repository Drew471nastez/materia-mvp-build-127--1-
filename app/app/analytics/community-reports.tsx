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
 *
 * WHAT THE COMMUNITIES TOOK IN (round 41, the owner: "Inside a community it
 * shows monthly revenue $83.33 ... when I go to analytics the revenue is not
 * there"). A second card, Community revenue, for a seller whose communities
 * sell: the payments received in the period (the community's orders less
 * refunds, with programs and tickets), its MRR at the period's end and who
 * pays for it, by the one rule its own pages use (lib/communities/
 * membership-money.ts), read from the same answer as the list. A switcher
 * picks one community or all of them together. Payments received and MRR are
 * named apart on purpose: a yearly plan paid last month is $83.33 of MRR and
 * nothing received this month.
 */
import * as React from "react"
import { ReportBody, ReportCard, ReportChange, ReportList, ReportTabs } from "./analytics-reports"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { AppLink } from "@/components/app/app-link"
import { formatCurrency } from "@/lib/markets/money"
import { moneyTotal, type MoneyAnswer } from "@/lib/communities/membership-money"

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
  money?: MoneyAnswer | null
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
    <>
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
    <CommunityMoney communities={shown} answers={answers} stale={!!question && question !== ask} runsToNow={span.end >= Date.now() - 60_000} />
    </>
  )
}

const SOURCE_LABEL: Record<string, string> = {
  get memberships() { return tt("Memberships and purchases") },
  get programs() { return tt("Programs") },
  get tickets() { return tt("Event tickets") },
}

/**
 * COMMUNITY REVENUE: the payments received in the period, the MRR at its end and who pays, for one community or all.
 * Drawn only once an answer says a community sells something.
 */
function CommunityMoney({ communities, answers, stale, runsToNow }: { communities: CommunityPlace[]; answers: Record<string, CommunityAnswer | "failed">; stale: boolean; runsToNow: boolean }) {
  const selling = communities.filter((c) => {
    const a = answers[c.id]
    return a && a !== "failed" && a.money
  })
  const all = moneyTotal(selling.map((c) => (answers[c.id] as CommunityAnswer).money as MoneyAnswer))
  const options = [...(all && selling.length > 1 ? [{ value: "all", label: tt("All") }] : []), ...selling.map((c) => ({ value: c.id, label: c.name }))]
  const [picked, setPicked] = React.useState("all")
  const chosen = options.some((o) => o.value === picked) ? picked : options[0]?.value ?? "all"
  if (selling.length === 0) return null
  const m = chosen === "all" ? all : moneyTotal([(answers[chosen] as CommunityAnswer).money as MoneyAnswer])
  if (!m) return null
  const money = (cents: number) => formatCurrency((cents || 0) / 100, m.currency.toUpperCase(), appLocale())
  const revenue = headline(m.revenue)
  return (
    <ReportCard
      card="community-money"
      title={tt("Community revenue")}
      help={tt("Payments received is the money paid in this period, less refunds. MRR is what the plans being paid for bring in a month, a yearly plan counted as a twelfth.")}
      tabs={options.length > 1 ? <ReportTabs label={tt("Community")} value={chosen} onChange={setPicked} options={options} /> : undefined}
      className={stale ? "opacity-60 transition-opacity duration-300" : "transition-opacity duration-300"}
    >
      <ReportBody blank={false} wait="figure">
        <div className="flex h-full flex-col" data-community-money={chosen}>
          <div className="flex items-baseline gap-2.5">
            <span className="text-[24px] font-bold tracking-tight tabular-nums text-[#1a1a2e]" data-money-received="">{money(m.revenue.value ?? 0)}</span>
            <ReportChange h={revenue} />
          </div>
          <p className="text-[12px] text-[#6b7280]">{tt("Payments received")}</p>
          <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[#f1f2f4] pt-3">
            <div className="min-w-0">
              <dt className="truncate text-[12px] text-[#6b7280]">{runsToNow ? tt("MRR now") : tt("MRR at the end")}</dt>
              <dd className="text-[16px] font-semibold tabular-nums text-[#1a1a2e]" data-money-mrr="">{money(m.mrr.value ?? 0)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="truncate text-[12px] text-[#6b7280]">{tt("Paying members")}</dt>
              <dd className="text-[16px] font-semibold tabular-nums text-[#1a1a2e]">{fmt(m.paying)}</dd>
            </div>
          </dl>
          <div className="mt-3 min-h-0 flex-1">
            <ReportList title={tt("Community revenue")} rows={m.bySource.slice(0, 3).map((x) => ({ key: x.key, label: SOURCE_LABEL[x.key] ?? x.key, value: x.cents }))} format={money} empty={tt("No payments in this period.")} />
          </div>
        </div>
      </ReportBody>
    </ReportCard>
  )
}
