"use client"

import * as React from "react"

import {
  BarChart,
  Card,
  Column,
  Delta,
  Problems,
  Section,
  Skeleton,
  Stat,
  Table,
  ago,
  money,
  num,
  pct,
  shortDate,
} from "./_ui"

type Problem = { metric: string; table: string; reason: string }
type Payload = Record<string, any> & { problems?: Problem[] }

/** The reason a card has no number, when it has none. */
function why(problems: Problem[] | undefined, metric: string): string | null {
  return problems?.find((p) => p.metric === metric)?.reason ?? null
}

export function Panel({ data, children }: { data: Payload | null; children: React.ReactNode }) {
  if (!data) return <Skeleton rows={5} />
  return (
    <div className="space-y-5">
      <Problems problems={data.problems ?? []} />
      {children}
    </div>
  )
}

/* ── Overview ────────────────────────────────────────────────────────────── */

export function Overview({ data }: { data: Payload | null }) {
  const c = data?.cards ?? {}
  const s = data?.series
  return (
    <Panel data={data}>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Live now" value={num(c.liveNow)} sub="visitors in the last 5 minutes" unavailable={why(data?.problems, "live now")} />
        <Stat label="Signups today" value={num(c.signupsToday)} sub="since midnight UTC" unavailable={why(data?.problems, "signups today")} />
        <Stat label="Revenue today" value={money(c.revenueTodayCents)} sub={`${num(c.ordersToday)} orders`} unavailable={why(data?.problems, "orders, 30d")} />
        <Stat label="Revenue all time" value={money(c.revenueAllTimeCents)} sub={`${num(c.ordersAllTime)} orders`} unavailable={why(data?.problems, "orders, all time")} />
        <Stat label="People" value={num(c.totalUsers)} sub={`${num(c.creators)} with a creator account`} unavailable={why(data?.problems, "total users")} />
        <Stat label="Published products" value={num(c.publishedProducts)} sub="live on the marketplace" unavailable={why(data?.problems, "published products")} />
        <Stat label="Visitors, 30 days" value={num(c.visitors30)} sub={`${num(c.views30)} page views`} unavailable={why(data?.problems, "views, 30d")} />
        <Stat label="Subscribers" value={num(c.subscribers)} sub={`${num(c.follows)} follows`} unavailable={why(data?.problems, "subscribers")} />
        <Stat label="Link pages live" value={num(c.onepagesLive)} sub="published OnePages" unavailable={why(data?.problems, "published link pages")} />
        <Stat label="Custom domains" value={num(c.customDomains)} sub="connected by creators" unavailable={why(data?.problems, "custom domains")} />
      </div>

      {s ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Section title="Revenue" hint="Completed orders, last 30 days">
            <BarChart days={s.days} values={s.revenueCents} format={money} />
          </Section>
          <Section title="Signups" hint="New accounts, last 30 days">
            <BarChart days={s.days} values={s.signups} colour="#2563eb" />
          </Section>
          <Section title="Page views" hint="Creator and product pages, last 30 days">
            <BarChart days={s.days} values={s.views} colour="#0891b2" />
          </Section>
          <Section title="Orders" hint="Completed orders per day">
            <BarChart days={s.days} values={s.orders} colour="#15803d" />
          </Section>
        </div>
      ) : null}
    </Panel>
  )
}

/* ── Live ────────────────────────────────────────────────────────────────── */

export function Live({ data }: { data: Payload | null }) {
  const countries: { name: string; views: number }[] = data?.countries ?? []
  const recent: { visitorId: string; country: string; lastSeen: string }[] = data?.recent ?? []
  return (
    <Panel data={data}>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="On the site now" value={num(data?.liveNow)} sub="distinct visitors, last 5 minutes" unavailable={why(data?.problems, "live visitors")} />
        <Stat label="Views, last 5 minutes" value={num(data?.viewsLastFive)} />
        <Stat label="Active in 30 minutes" value={num(data?.activeHalfHour)} sub="distinct visitors" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Where they are" hint="Views in the last 5 minutes">
          <Table
            rows={countries}
            rowKey={(r) => r.name}
            empty="Nobody on the site in the last five minutes."
            columns={[
              { key: "name", head: "Country", render: (r) => r.name },
              { key: "views", head: "Views", numeric: true, render: (r) => num(r.views) },
            ] as Column<{ name: string; views: number }>[]}
          />
        </Section>
        <Section title="Recently active" hint="One row per visitor, newest first">
          <Table
            rows={recent}
            rowKey={(r) => r.visitorId}
            empty="No activity in the last half hour."
            columns={[
              { key: "id", head: "Visitor", render: (r) => <span className="font-mono text-[13px] text-[#6b7280]">{r.visitorId}</span> },
              { key: "country", head: "Country", render: (r) => r.country },
              { key: "seen", head: "Last seen", numeric: true, render: (r) => ago(r.lastSeen) },
            ] as Column<{ visitorId: string; country: string; lastSeen: string }>[]}
          />
        </Section>
      </div>
    </Panel>
  )
}

/* ── Revenue ─────────────────────────────────────────────────────────────── */

export function Revenue({
  data,
  days,
  onDays,
}: {
  data: Payload | null
  days: 30 | 90
  onDays: (d: 30 | 90) => void
}) {
  const t = data?.totals
  const top: { id: string; name: string; cents: number; orders: number }[] = data?.topCreators ?? []
  return (
    <Panel data={data}>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Today" value={money(t?.todayCents)} sub={`${num(t?.ordersToday)} orders`} unavailable={why(data?.problems, "orders, all time")} />
        <Stat label="Last 7 days" value={money(t?.last7Cents)} sub={<Delta value={t?.change7Pct} />} />
        <Stat label="Last 30 days" value={money(t?.last30Cents)} sub={<Delta value={t?.change30Pct} />} />
        <Stat label="All time" value={money(t?.allTimeCents)} sub={`${num(t?.ordersAllTime)} orders`} />
        <Stat label="Average order" value={money(t?.aovCents)} sub="across every completed order" />
        <Stat label="Buyers" value={num(t?.buyers)} sub="distinct email addresses" />
        <Stat label="Orders, 7 days" value={num(t?.orders7)} />
        <Stat label="Orders, 30 days" value={num(t?.orders30)} />
      </div>

      <Section
        title="Revenue by day"
        hint="Completed orders only"
        right={
          <div className="flex gap-1 rounded-lg bg-[#f1f3f5] p-0.5">
            {([30, 90] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onDays(d)}
                className={`rounded-md px-3 py-1 text-[13px] font-medium transition-colors ${
                  days === d ? "bg-white text-[#1a1a2e] shadow-sm" : "text-[#6b7280] hover:text-[#1a1a2e]"
                }`}
              >
                {d} days
              </button>
            ))}
          </div>
        }
      >
        {data?.series ? <BarChart days={data.series.days} values={data.series.revenueCents} format={money} /> : <Skeleton rows={2} />}
      </Section>

      <Section title="Who is selling" hint="Top creators by completed revenue">
        <Table
          rows={top}
          rowKey={(r) => r.id}
          empty="No completed orders yet."
          columns={[
            { key: "name", head: "Creator", render: (r) => r.name },
            { key: "orders", head: "Orders", numeric: true, render: (r) => num(r.orders) },
            { key: "cents", head: "Revenue", numeric: true, render: (r) => money(r.cents) },
          ] as Column<{ id: string; name: string; cents: number; orders: number }>[]}
        />
      </Section>
    </Panel>
  )
}

/* ── Traffic ─────────────────────────────────────────────────────────────── */

export function Traffic({ data }: { data: Payload | null }) {
  const k = data?.kpis ?? {}
  const sources: { name: string; views: number; visitors: number }[] = data?.sources ?? []
  return (
    <Panel data={data}>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Page views, 30d" value={num(k.views)} unavailable={why(data?.problems, "views, 30d")} />
        <Stat label="Visitors, 30d" value={num(k.visitors)} sub="distinct visitor ids" />
        <Stat label="Sessions, 30d" value={num(k.sessions)} />
        <Stat label="Product views" value={num(k.productViews)} sub="of the views above" />
        <Stat label="Signups, 30d" value={num(k.signups)} unavailable={why(data?.problems, "signups, 30d")} />
        <Stat label="Orders, 30d" value={num(k.orders)} unavailable={why(data?.problems, "orders, 30d")} />
        <Stat label="Orders per visitor" value={pct(k.conversionPct, 2)} sub="a view is not tied to a signup, so this is the honest ratio" />
      </div>

      <Section title="Where visitors come from" hint="Grouped by the source recorded on the view">
        <Table
          rows={sources}
          rowKey={(r) => r.name}
          empty="No views recorded in the last 30 days."
          columns={[
            { key: "name", head: "Source", render: (r) => r.name },
            { key: "visitors", head: "Visitors", numeric: true, render: (r) => num(r.visitors) },
            { key: "views", head: "Views", numeric: true, render: (r) => num(r.views) },
          ] as Column<{ name: string; views: number; visitors: number }>[]}
        />
      </Section>
    </Panel>
  )
}

/* ── Geography ───────────────────────────────────────────────────────────── */

type CountryRow = { code: string; name: string; views: number; visitors: number; orders: number; cents: number; aovCents: number }

export function Geography({ data }: { data: Payload | null }) {
  const [sort, setSort] = React.useState<"cents" | "views" | "orders">("cents")
  const countries: CountryRow[] = data?.countries ?? []
  const sorted = React.useMemo(
    () => [...countries].sort((a, b) => (b[sort] as number) - (a[sort] as number)),
    [countries, sort],
  )
  return (
    <Panel data={data}>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Countries seen" value={num(countries.length)} sub="with a view or an order" />
        <Stat label="Countries buying" value={num(data?.sellingCountries)} />
        <Stat label="Top country" value={sorted[0]?.name ?? "—"} sub={sorted[0] ? money(sorted[0].cents) : undefined} />
        <Stat
          label="Revenue outside the top"
          value={money(sorted.slice(1).reduce((a, c) => a + c.cents, 0))}
          sub="everywhere except the leader"
        />
      </div>

      <Section
        title="By country"
        hint="Views over 90 days, orders over all time"
        right={
          <div className="flex gap-1 rounded-lg bg-[#f1f3f5] p-0.5">
            {(["cents", "orders", "views"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                className={`rounded-md px-3 py-1 text-[13px] font-medium capitalize transition-colors ${
                  sort === k ? "bg-white text-[#1a1a2e] shadow-sm" : "text-[#6b7280] hover:text-[#1a1a2e]"
                }`}
              >
                {k === "cents" ? "revenue" : k}
              </button>
            ))}
          </div>
        }
      >
        <Table
          rows={sorted}
          rowKey={(r) => r.code}
          empty="No countries recorded yet."
          columns={[
            { key: "name", head: "Country", render: (r) => `${r.name} (${r.code})` },
            { key: "visitors", head: "Visitors", numeric: true, render: (r) => num(r.visitors) },
            { key: "views", head: "Views", numeric: true, render: (r) => num(r.views) },
            { key: "orders", head: "Orders", numeric: true, render: (r) => num(r.orders) },
            { key: "aov", head: "Avg order", numeric: true, render: (r) => (r.orders ? money(r.aovCents) : "—") },
            { key: "cents", head: "Revenue", numeric: true, render: (r) => money(r.cents) },
          ] as Column<CountryRow>[]}
        />
      </Section>
    </Panel>
  )
}

/* ── Creators, products, users, activity, health ─────────────────────────── */

type CreatorRow = { id: string; handle: string; name: string; joined: string | null; published: number; orders: number; cents: number }

export function Creators({ data }: { data: Payload | null }) {
  const rows: CreatorRow[] = data?.creators ?? []
  return (
    <Panel data={data}>
      <Section title="Creators" hint="The 300 most recent, with what they have published and earned">
        <Table
          rows={rows}
          rowKey={(r) => r.id}
          empty="No creator accounts yet."
          columns={[
            {
              key: "name",
              head: "Creator",
              render: (r) => (
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#1a1a2e]">{r.name}</p>
                  {r.handle ? (
                    <a href={`/${r.handle}`} target="_blank" rel="noreferrer" className="text-[13px] text-[#8b5cf6] hover:underline">
                      storelib.com/{r.handle}
                    </a>
                  ) : null}
                </div>
              ),
            },
            { key: "joined", head: "Joined", render: (r) => shortDate(r.joined) },
            { key: "published", head: "Published", numeric: true, render: (r) => num(r.published) },
            { key: "orders", head: "Orders", numeric: true, render: (r) => num(r.orders) },
            { key: "cents", head: "Revenue", numeric: true, render: (r) => money(r.cents) },
          ] as Column<CreatorRow>[]}
        />
      </Section>
    </Panel>
  )
}

type ProductRow = { id: string; title: string; slug: string; status: string; priceCents: number; created: string | null; orders: number; cents: number }

export function Products({ data }: { data: Payload | null }) {
  const rows: ProductRow[] = data?.products ?? []
  return (
    <Panel data={data}>
      <Section title="Products" hint="The 300 most recent">
        <Table
          rows={rows}
          rowKey={(r) => r.id}
          empty="No products yet."
          columns={[
            {
              key: "title",
              head: "Product",
              render: (r) => (
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#1a1a2e]">{r.title}</p>
                  <p className="truncate text-[13px] text-[#6b7280]">{r.slug}</p>
                </div>
              ),
            },
            {
              key: "status",
              head: "Status",
              render: (r) => (
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium ${
                    r.status === "published" ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#f1f3f5] text-[#6b7280]"
                  }`}
                >
                  {r.status}
                </span>
              ),
            },
            { key: "price", head: "Price", numeric: true, render: (r) => money(r.priceCents) },
            { key: "orders", head: "Sold", numeric: true, render: (r) => num(r.orders) },
            { key: "cents", head: "Revenue", numeric: true, render: (r) => money(r.cents) },
            { key: "created", head: "Added", numeric: true, render: (r) => shortDate(r.created) },
          ] as Column<ProductRow>[]}
        />
      </Section>
    </Panel>
  )
}

type UserRow = { id: string; handle: string; name: string; joined: string | null }

export function Users({
  data,
  query,
  onQuery,
}: {
  data: Payload | null
  query: string
  onQuery: (q: string) => void
}) {
  const rows: UserRow[] = data?.users ?? []
  return (
    <Panel data={data}>
      <Section
        title="People"
        hint={query ? `Matching “${query}”` : "The 200 most recent accounts"}
        right={
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search by handle or name"
            className="h-9 w-56 rounded-lg border border-[#e5e7eb] px-3 text-[14px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#8b5cf6]"
          />
        }
      >
        <Table
          rows={rows}
          rowKey={(r) => r.id}
          empty={query ? "Nobody matches that." : "No accounts yet."}
          columns={[
            {
              key: "name",
              head: "Person",
              render: (r) => (
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#1a1a2e]">{r.name}</p>
                  {r.handle ? (
                    <a href={`/${r.handle}`} target="_blank" rel="noreferrer" className="text-[13px] text-[#8b5cf6] hover:underline">
                      @{r.handle}
                    </a>
                  ) : null}
                </div>
              ),
            },
            { key: "joined", head: "Joined", numeric: true, render: (r) => shortDate(r.joined) },
          ] as Column<UserRow>[]}
        />
      </Section>
    </Panel>
  )
}

type ActivityItem = { at: string; kind: "order" | "signup" | "product"; text: string; amountCents?: number }

export function Activity({ data }: { data: Payload | null }) {
  const items: ActivityItem[] = data?.items ?? []
  const chip = {
    order: { label: "Order", cls: "bg-[#dcfce7] text-[#15803d]" },
    signup: { label: "Signup", cls: "bg-[#ede9fe] text-[#6d28d9]" },
    product: { label: "Product", cls: "bg-[#dbeafe] text-[#1d4ed8]" },
  }
  return (
    <Panel data={data}>
      <Section title="Activity" hint="Orders, signups and published products, newest first">
        {items.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-[#6b7280]">Nothing has happened yet.</p>
        ) : (
          <ul className="divide-y divide-[#e5e7eb]/40">
            {items.map((it, i) => (
              <li key={`${it.at}-${i}`} className="flex items-center gap-3 px-5 py-3">
                <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium ${chip[it.kind].cls}`}>
                  {chip[it.kind].label}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] text-[#1a1a2e]">{it.text}</span>
                {it.amountCents !== undefined ? (
                  <span className="shrink-0 text-[14px] font-medium tabular-nums text-[#1a1a2e]">{money(it.amountCents)}</span>
                ) : null}
                <span className="w-20 shrink-0 text-right text-[13px] text-[#6b7280]">{ago(it.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Panel>
  )
}

type HealthRow = { table: string; ok: boolean; rows: number | null; reason: string | null }

export function Health({ data }: { data: Payload | null }) {
  const checks: HealthRow[] = data?.checks ?? []
  const broken = checks.filter((c) => !c.ok)
  return (
    <Panel data={data}>
      <Card className={`p-4 ${broken.length ? "border-[#fecaca] bg-[#fef2f2]" : "border-[#bbf7d0] bg-[#f0fdf4]"}`}>
        <p className={`text-[14px] font-semibold ${broken.length ? "text-[#b91c1c]" : "text-[#15803d]"}`}>
          {broken.length === 0
            ? `All ${checks.length} tables answered.`
            : `${broken.length} of ${checks.length} tables did not answer.`}
        </p>
        <p className="mt-1 text-[13px] text-[#6b7280]">
          Each row is a counting query against a table this dashboard reads. A failure here is why a card
          elsewhere would otherwise show a zero it never measured.
        </p>
      </Card>

      <Section title="Tables" hint="A head-only count, so no rows are read">
        <Table
          rows={checks}
          rowKey={(r) => r.table}
          empty="No checks ran."
          columns={[
            { key: "table", head: "Table", render: (r) => <span className="font-mono text-[13px]">{r.table}</span> },
            {
              key: "ok",
              head: "Status",
              render: (r) => (
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium ${
                    r.ok ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#fee2e2] text-[#b91c1c]"
                  }`}
                >
                  {r.ok ? "answered" : "failed"}
                </span>
              ),
            },
            { key: "reason", head: "Reason", render: (r) => <span className="text-[13px] text-[#b91c1c]">{r.reason ?? ""}</span> },
            { key: "rows", head: "Rows", numeric: true, render: (r) => num(r.rows) },
          ] as Column<HealthRow>[]}
        />
      </Section>
    </Panel>
  )
}
