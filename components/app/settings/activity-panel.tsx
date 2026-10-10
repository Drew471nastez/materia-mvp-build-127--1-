"use client"

/**
 * SETTINGS › ACTIVITY: every change made to the store, newest first, grouped
 * by day (lib/activity, SQL part 113). Filter by Products, Orders, Settings
 * or Files; 40 at a time with Show more. A row says what was done and to
 * what, who did it (you, Storelib, or a buyer opening a return) and when.
 */
import * as React from "react"
import { FileImage, Package, Settings2, ShoppingBag } from "lucide-react"
import { cn } from "@/lib/utils"
import { BTN_SECONDARY, Card, Notice, api } from "@/components/physical/ui"
import { GROUP_LABELS, actorLabel, describeActivity, groupOf, type ActivityEntry, type ActivityGroup } from "@/lib/activity/actions"

type Filter = "all" | ActivityGroup
const FILTERS: Filter[] = ["all", "products", "orders", "settings", "files"]
const ICONS: Record<ActivityGroup, React.ComponentType<{ className?: string }>> = { products: Package, orders: ShoppingBag, settings: Settings2, files: FileImage }

type Page = { entries: ActivityEntry[]; more: boolean; missing: boolean }

export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((start(now) - start(d)) / 86_400_000)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  return new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) }).format(d)
}

const timeOf = (iso: string) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(iso))

export function ActivityPanel() {
  const [filter, setFilter] = React.useState<Filter>("all")
  const [entries, setEntries] = React.useState<ActivityEntry[] | null>(null)
  const [more, setMore] = React.useState(false)
  const [missing, setMissing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [loadingMore, setLoadingMore] = React.useState(false)

  const fetchPage = React.useCallback(async (f: Filter, before: number | null) => {
    const q = new URLSearchParams()
    if (f !== "all") q.set("group", f)
    if (before) q.set("before", String(before))
    const qs = q.toString()
    return api<Page>(`/api/store/activity${qs ? `?${qs}` : ""}`)
  }, [])

  React.useEffect(() => {
    let live = true
    setEntries(null)
    setError(null)
    void fetchPage(filter, null).then((r) => {
      if (!live) return
      if ("error" in r) return setError(r.error)
      setEntries(r.data.entries)
      setMore(r.data.more)
      setMissing(r.data.missing)
    })
    return () => {
      live = false
    }
  }, [filter, fetchPage])

  const showMore = async () => {
    const last = entries?.[entries.length - 1]
    if (!last) return
    setLoadingMore(true)
    const r = await fetchPage(filter, last.id)
    setLoadingMore(false)
    if ("error" in r) return setError(r.error)
    setEntries((list) => [...(list ?? []), ...r.data.entries])
    setMore(r.data.more)
  }

  const days: { label: string; rows: ActivityEntry[] }[] = []
  for (const e of entries ?? []) {
    const label = dayLabel(e.createdAt)
    const last = days[days.length - 1]
    if (last && last.label === label) last.rows.push(e)
    else days.push({ label, rows: [e] })
  }

  return (
    <div className="space-y-4 sm:space-y-6" data-activity-panel="">
      <Card title="Activity" description="Every change made to your store: products, orders, settings and files, who made it and when.">
        <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Show" data-activity-filters="">
          {FILTERS.map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn("inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-medium transition-colors", filter === f ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#e5e7eb] bg-white text-[#374151] hover:bg-[#f8f9fa]")}>
              {f === "all" ? "All" : GROUP_LABELS[f]}
            </button>
          ))}
        </div>

        {error ? <Notice>{error}</Notice> : null}
        {missing ? <Notice>The activity log needs SQL part 113 (supabase/sql/run-now/113_store_activity.sql). Once it has run, changes show here from then on.</Notice> : null}

        {entries === null && !error ? (
          <div className="min-h-[200px]" aria-busy="true" />
        ) : entries && entries.length === 0 && !missing ? (
          <div className="flex min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-[#e3e5e8] px-4 py-8 text-center" data-activity-empty="">
            <p className="text-[14px] font-medium text-[#1a1a2e]">Nothing here yet</p>
            <p className="mt-1 text-[13px] text-[#6b7280]">When you add a product, ship an order or change a setting, it shows up here.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {days.map((d) => (
              <section key={d.label} aria-label={d.label}>
                <h3 className="mb-1.5 text-[12.5px] font-semibold text-[#6b7280]">{d.label}</h3>
                <ul className="divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]">
                  {d.rows.map((e) => {
                    const Icon = ICONS[groupOf(e.action)]
                    return (
                      <li key={e.id} className="flex items-start gap-3 px-3.5 py-3" data-activity={e.action}>
                        <span aria-hidden className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f3f4f6] text-[#4b5563]">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-[14px] text-[#1a1a2e]">{describeActivity(e)}</span>
                          <span className="block text-[12.5px] text-[#6b7280]">
                            {actorLabel(e.actor)} · {timeOf(e.createdAt)}
                          </span>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
            {more ? (
              <button type="button" className={cn(BTN_SECONDARY, "w-full")} onClick={() => void showMore()} disabled={loadingMore} data-activity-more="">
                {loadingMore ? "Loading" : "Show more"}
              </button>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  )
}
