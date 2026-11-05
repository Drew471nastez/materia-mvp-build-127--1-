"use client"

import * as React from "react"

import type { OverviewPayload } from "@/lib/admin/types"

import { money, moneyShort, num } from "./format"
import type { Route } from "./nav-state"
import { ViewHeader } from "./shell"
import { Bars, DataList, Figures, Panel, ReadNotes, reasonFor } from "./ui"

/**
 * What the platform sold, who is selling, and what needs somebody today.
 * The first row is money, because that is the first question; the second is
 * the size of the platform; then the short list of things that are wrong.
 */
export function OverviewView({ data, go }: { data: OverviewPayload; go: (r: Partial<Route>) => void }) {
  const f = data.figures
  const p = data.problems
  const totals = reasonFor(p, "orders, all time", "orders, 30 days")
  const today = reasonFor(p, "orders, today")
  const [series, setSeries] = React.useState<"gmv" | "orders" | "signups">("gmv")

  return (
    <div className="space-y-4">
      <ViewHeader title="Overview" meta="Last 30 days unless a figure says otherwise. Times are UTC." />
      <ReadNotes problems={p} notices={data.notices} />

      <Figures
        items={[
          { label: "Sales, 30 days", value: moneyShort(f.gmv30), sub: f.gmvToday !== null ? `${money(f.gmvToday)} today` : undefined, unreadable: f.gmv30 === null ? totals : null },
          { label: "Storelib fees, 30 days", value: moneyShort(f.fees30), sub: f.feesAll !== null ? `${moneyShort(f.feesAll)} all time` : undefined, unreadable: f.fees30 === null ? totals : null },
          { label: "Orders, 30 days", value: num(f.orders30), sub: f.ordersToday !== null ? `${num(f.ordersToday)} today` : undefined, unreadable: f.orders30 === null ? totals ?? today : null },
          { label: "Sales, all time", value: moneyShort(f.gmvAll), sub: f.ordersAll !== null ? `${num(f.ordersAll)} orders` : undefined, unreadable: f.gmvAll === null ? totals : null },
        ]}
      />

      <Figures
        columns={4}
        items={[
          { label: "Creators", value: num(f.creators), sub: f.newCreators30 !== null ? `${num(f.newCreators30)} new` : undefined, unreadable: f.creators === null ? reasonFor(p, "creators") : null },
          { label: "Creators with a sale", value: num(f.activeCreators30), sub: "in 30 days", unreadable: f.activeCreators30 === null ? reasonFor(p, "creators with a sale") : null },
          { label: "Accounts", value: num(f.accounts), sub: f.signups30 !== null ? `${num(f.signups30)} signed up` : undefined, unreadable: f.accounts === null ? reasonFor(p, "accounts") : null },
          { label: "Paid plans", value: num(f.proSubscriptions), sub: "active or trialing", unreadable: f.proSubscriptions === null ? reasonFor(p, "paid plans") : null },
          { label: "Published products", value: num(f.publishedProducts), unreadable: f.publishedProducts === null ? reasonFor(p, "published products") : null },
          { label: "Published websites", value: num(f.publishedSites), unreadable: f.publishedSites === null ? reasonFor(p, "published websites") : null },
          { label: "Failed payments", value: num(f.failed30), sub: f.refunded30 !== null ? `${num(f.refunded30)} refunded` : undefined, unreadable: f.failed30 === null ? totals : null },
          { label: "In dispute", value: num(f.disputes), sub: "orders, now", unreadable: f.disputes === null ? totals : null },
        ]}
      />

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel
          title="By day"
          meta={data.totalsFrom === "rows" ? "Added up from order rows" : undefined}
          action={
            <div className="flex gap-0.5" role="tablist" aria-label="Series">
              {(
                [
                  ["gmv", "Sales"],
                  ["orders", "Orders"],
                  ["signups", "Signups"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={series === id}
                  onClick={() => setSeries(id)}
                  className={`h-7 rounded-[6px] px-2 text-[12px] ${series === id ? "bg-white/[0.08] text-[#ededf0]" : "text-[#9b9ba6] hover:text-[#ededf0]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        >
          {data.series ? (
            <Bars
              days={data.series.days}
              values={series === "gmv" ? data.series.gmv : series === "orders" ? data.series.orders : data.series.signups}
              format={(v) => (series === "gmv" ? money(v) : num(v))}
              label={`${series === "gmv" ? "Sales" : series === "orders" ? "Orders" : "Signups"} per day for 30 days`}
            />
          ) : (
            <p className="px-4 py-6 text-[13px] text-[#9b9ba6]">Could not be read. {reasonFor(p, "sales by day")}</p>
          )}
        </Panel>

        <Panel title="Needs attention" meta={data.attention.length ? undefined : "Nothing right now"}>
          {data.attention.length ? (
            <ul>
              {data.attention.map((a) => (
                <li key={a.key} className="border-b border-white/[0.06] last:border-b-0">
                  <button
                    type="button"
                    onClick={() => go({ view: a.view, filter: a.filter ?? "", q: "", page: 1, id: "" })}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-white/[0.03]"
                  >
                    <span className="min-w-0 truncate text-[13px] text-[#ededf0]">{a.label}</span>
                    <span className="shrink-0 text-[13px] font-medium tabular-nums text-[#f47067]">{num(a.count)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-[13px] text-[#6b6b76]">No disputes, failed payouts, overdue holds, open reports, failing domains or failed sends.</p>
          )}
        </Panel>
      </div>

      <Panel title="Top creators" meta="By sales, 30 days">
        {data.topCreators ? (
          <DataList
            label="Top creators"
            rows={data.topCreators}
            rowKey={(r) => r.id}
            empty="No sales in the last 30 days."
            onOpen={(r) => go({ view: "creator", id: r.id, q: "", filter: "", page: 1 })}
            columns={[
              { key: "name", label: "Creator", width: "minmax(0,2fr)", phone: "primary", render: (r) => r.name },
              { key: "handle", label: "Handle", width: "minmax(0,1.4fr)", render: (r) => (r.handle ? `@${r.handle}` : "") },
              { key: "orders", label: "Orders", width: "90px", align: "right", render: (r) => `${num(r.orders)} orders` },
              { key: "gross", label: "Sales", width: "110px", align: "right", phone: "end", render: (r) => money(r.gross) },
            ]}
          />
        ) : (
          <p className="px-4 py-6 text-[13px] text-[#9b9ba6]">Could not be read. {reasonFor(p, "top creators")}</p>
        )}
      </Panel>
    </div>
  )
}
