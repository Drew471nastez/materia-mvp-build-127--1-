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
import { BTN_SECONDARY, Card, Notice, api, peekGet, prefetchGet, readFresh } from "@/components/physical/ui"
import { GROUP_LABELS, actorLabel, describeActivity, groupOf, type ActivityEntry, type ActivityGroup } from "@/lib/activity/actions"

type Filter = "all" | ActivityGroup
const FILTERS: Filter[] = ["all", "products", "orders", "settings", "files"]
const ICONS: Record<ActivityGroup, React.ComponentType<{ className?: string }>> = { products: Package, orders: ShoppingBag, settings: Settings2, files: FileImage }

type Page = { entries: ActivityEntry[]; more: boolean; missing: boolean }

const EMPTY_LINE: Record<Filter, string> = {
  all: "When you add a product, ship an order or change a setting, it shows up here.",
  products: "Adding, renaming, repricing or publishing a product shows up here.",
  orders: "Fulfilling, cancelling, refunding or a buyer opening a return shows up here.",
  settings: "Changes to your store, checkout, taxes, shipping and integrations show up here.",
  files: "Files you delete from your library show up here.",
}

export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((start(now) - start(d)) / 86_400_000)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  return new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) }).format(d)
}

const timeOf = (iso: string) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(iso))

const pathOf = (f: Filter, before: number | null = null) => {
  const q = new URLSearchParams()
  if (f !== "all") q.set("group", f)
  if (before) q.set("before", String(before))
  const qs = q.toString()
  return `/api/store/activity${qs ? `?${qs}` : ""}`
}

/**
 * WHAT A PILL SHOWS THE MOMENT IT IS PRESSED (round R1). "Switching its pills
 * shows blank, then Nothing here yet after a delay." A press cleared the list
 * and asked the server again, every time. Now, in order:
 *
 *   its own answer, kept   from an earlier press or fetched ahead
 *                          (components/physical/ui peekGet)
 *   worked out from All    when All is the whole log (no Show more), every
 *                          filter is exactly All's rows of that group, so it
 *                          needs no request at all
 *   still unknown          a few grey rows the shape of the list, never an
 *                          empty card and never "Nothing here yet" until the
 *                          answer says so
 */
function firstPage(f: Filter): Page | null {
  const own = peekGet<Page>(pathOf(f))
  if (own) return own
  const all = peekGet<Page>(pathOf("all"))
  if (f !== "all" && all && !all.more && !all.missing) return { entries: all.entries.filter((e) => groupOf(e.action) === f), more: false, missing: false }
  return null
}

export function ActivityPanel() {
  const [filter, setFilter] = React.useState<Filter>("all")
  /* Each pill's list as far as it has been read: its first page and any Show more after it. */
  const [lists, setLists] = React.useState<Partial<Record<Filter, Page>>>(() => {
    const all = firstPage("all")
    return all ? { all } : {}
  })
  const [error, setError] = React.useState<string | null>(null)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const shown = lists[filter] ?? firstPage(filter)
  const entries = shown?.entries ?? null
  const more = shown?.more ?? false
  const missing = shown?.missing ?? false

  /* The pill's own first page, read now (kept, so a second press is instant), and the other pills' fetched ahead once All says they need it. */
  React.useEffect(() => {
    let live = true
    setError(null)
    const path = pathOf(filter)
    /* Drawn from what is kept, and always read again behind it: a change made a moment ago elsewhere shows up here. */
    void readFresh<Page>(path).then((r) => {
      if (!live) return
      if (!r.ok) return setError(r.error)
      setLists((l) => ({ ...l, [filter]: r.data }))
      if (filter === "all" && r.data.more) prefetchGet(FILTERS.filter((f) => f !== "all").map((f) => pathOf(f)))
    })
    return () => {
      live = false
    }
  }, [filter])

  const showMore = async () => {
    const last = entries?.[entries.length - 1]
    if (!last) return
    setLoadingMore(true)
    const r = await api<Page>(pathOf(filter, last.id))
    setLoadingMore(false)
    if (!r.ok) return setError(r.error)
    setLists((l) => {
      const base = l[filter] ?? shown ?? { entries: [], more: false, missing: false }
      return { ...l, [filter]: { ...base, entries: [...base.entries, ...r.data.entries], more: r.data.more } }
    })
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
        {/* Storelib's pills (Settings' own row): words on the card, the open one on a soft grey fill with a hairline, eased in place. */}
        <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Show" data-activity-filters="">
          {FILTERS.map((f) => {
            const on = filter === f
            return (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setFilter(f)}
                onPointerEnter={() => prefetchGet([pathOf(f)])}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-[13.5px] font-medium outline-none transition-[color,background-color,box-shadow] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]",
                  on ? "bg-[#f3f4f6] text-[#1a1a2e] shadow-[inset_0_0_0_1px_#d1d5db,0_1px_2px_rgba(0,0,0,0.04)]" : "text-[#6b7280] hover:bg-[#f7f7f8] hover:text-[#1a1a2e] active:bg-[#f3f4f6]",
                )}
              >
                {f === "all" ? "All" : GROUP_LABELS[f]}
              </button>
            )
          })}
        </div>

        {error && !entries ? <Notice>{error}</Notice> : null}
        {missing ? <Notice>The activity log needs SQL part 113 (supabase/sql/run-now/113_store_activity.sql). Once it has run, changes show here from then on.</Notice> : null}

        {entries === null && !error ? (
          <ul className="divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#eceef1]" aria-busy="true" aria-label="Loading" data-activity-loading="">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="flex items-center gap-3 px-3.5 py-3">
                <span aria-hidden className="h-8 w-8 shrink-0 rounded-lg bg-[#f3f4f6]" />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span aria-hidden className="block h-3.5 rounded bg-[#f1f2f4]" style={{ width: `${62 - i * 9}%` }} />
                  <span aria-hidden className="block h-3 w-24 rounded bg-[#f5f6f7]" />
                </span>
              </li>
            ))}
          </ul>
        ) : entries && entries.length === 0 && !missing ? (
          <div key={filter} className="flex min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-[#e3e5e8] px-4 py-8 text-center animate-in fade-in-50 duration-150 motion-reduce:animate-none" data-activity-empty="">
            <p className="text-[14px] font-medium text-[#1a1a2e]">{filter === "all" ? "Nothing here yet" : `No ${GROUP_LABELS[filter].toLowerCase()} changes yet`}</p>
            <p className="mt-1 text-[13px] text-[#6b7280]">{EMPTY_LINE[filter]}</p>
          </div>
        ) : (
          <div key={filter} className="space-y-5 animate-in fade-in-50 duration-150 motion-reduce:animate-none" data-activity-list={filter}>
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
