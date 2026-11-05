"use client"

/**
 * ===========================================================================
 *  INVENTORY: WHAT IS ON THE SHELF, WHAT IS SOLD, WHAT IS COMING
 * ===========================================================================
 * Every physical variant, one row, with on hand, committed (sold or held,
 * not shipped), available and incoming, for all locations or one.
 *
 *   ADJUST     one window (a dialog on a computer, the app's sheet on a
 *              phone): add, remove or set to, with a reason and a note, the
 *              result shown before it is saved (lib/physical/inventory-rules
 *              planAdjust, the same sums part 214 does under the lock), and
 *              the stock settings beside it: Track stock, Keep selling when
 *              out of stock, the low stock line, units on order.
 *   HISTORY    every change, newest first, fifty at a time: why, where,
 *              who or what made it (You, a team member, an order, a return,
 *              a transfer, an import), on hand before and after.
 *   TRANSFERS  between two locations: a draft, sent (out of the origin,
 *              incoming at the destination), received all at once or in
 *              part, or cancelled (what has not arrived goes back).
 *   EXPORT     the shop's stock as CSV; IMPORT the same columns back in as
 *              stock counts.
 *
 * Everything goes through /api/physical/inventory and the stock functions
 * behind it, so two people changing stock at once never lose a change.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRightLeft, Check, ChevronDown, Download, History, Minus, MoreHorizontal, Package, Plus, Search, Upload } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar, card } from "../orders/order-parts"
import { REASON_LABEL } from "@/lib/physical/inventory-server-labels"
import { REASONS_FOR, inInventoryView, planAdjust, readUnits, receivePlan, stockState, transferActions, type AdjustMode, type InventoryView, type MovementSource, type StockState } from "@/lib/physical/inventory-rules"
import type { Location } from "@/lib/physical/types"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, Empty, Field, Modal, Notice, NumberInput, Pill, Reveal, SelectInput, TextInput, Toggle, actionKey, api, dateTime } from "@/components/physical/ui"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { saveFile, savedMessage } from "@/lib/platform/save-file"
import { fileThumb } from "@/lib/files/thumb"
import { tt } from "@/lib/i18n/text"

interface Level {
  variantId: string
  locationId: string
  onHand: number
  committed: number
  incoming: number
  available: number
}
export interface InventoryRowView {
  variantId: string
  productId: string
  productTitle: string
  productImage: string | null
  variantName: string
  sku: string | null
  trackInventory: boolean
  keepSelling: boolean
  productKeepsSelling: boolean
  madeToOrder: boolean
  lowStockThreshold: number
  variantLowStock: number | null
  productLowStock: number | null
  levels: Level[]
  onHand: number
  committed: number
  available: number
  incoming: number
}
type Row = InventoryRowView
interface Movement {
  id: number
  variantId: string | null
  locationId: string | null
  deltaOnHand: number
  deltaCommitted: number
  deltaIncoming: number
  onHandAfter: number | null
  onHandBefore: number | null
  reason: string
  note: string | null
  actor: string
  source: MovementSource
  by: string | null
  createdAt: string
}
interface Transfer {
  id: string
  origin_location_id: string | null
  destination_location_id: string | null
  status: string
  reference: string | null
  created_at: string
  shipped_at?: string | null
  received_at?: string | null
  inventory_transfer_items: { id: string; variant_id: string; quantity: number; received_quantity: number }[]
}

type View = InventoryView
const VIEWS: { id: View; label: string }[] = [
  { id: "all", get label() { return tt("All") } },
  { id: "low", get label() { return tt("Low stock") } },
  { id: "out", get label() { return tt("Out of stock") } },
  { id: "incoming", get label() { return tt("Incoming") } },
]

function levelAt(r: Row, loc: string): { onHand: number; committed: number; available: number; incoming: number } {
  if (!loc) return r
  const l = r.levels.find((x) => x.locationId === loc)
  return l ?? { onHand: 0, committed: 0, available: 0, incoming: 0 }
}

/** Which view a row is in: Low is at or under its line, out of stock included, as the low stock email counts it; Out is zero or less (lib/physical/inventory-rules inInventoryView). */
const inView = (r: Row, l: { available: number; incoming: number }, v: View): boolean => inInventoryView(r, l, v)

const fullName = (r: { productTitle: string; variantName: string }) => (r.variantName && r.variantName !== "Default" ? `${r.productTitle}, ${r.variantName}` : r.productTitle)

/** What a row says about its stock, in words and a colour, never a pill. */
function StateWord({ state, keepSelling }: { state: StockState; keepSelling: boolean }) {
  if (state === "untracked") return <span className="text-[#6b7280]">{tt("Not tracked")}</span>
  if (state === "oversold") return <span className="font-medium text-[#b42318]">{tt("Oversold")}</span>
  if (state === "out") return <span className={cn("font-medium", keepSelling ? "text-[#92400e]" : "text-[#b42318]")}>{keepSelling ? tt("Out, still selling") : tt("Out of stock")}</span>
  if (state === "low") return <span className="font-medium text-[#92400e]">{tt("Low")}</span>
  return null
}

/** A product's picture at the size it is drawn (lib/files/thumb.ts, the optimizer), never the camera original. */
function Thumb({ src, size = 40 }: { src: string | null; size?: number }) {
  const t = React.useMemo(() => (src ? fileThumb(src, `${size}px`) : null), [src, size])
  return t ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={t.src} srcSet={t.srcSet} sizes={t.sizes} alt="" loading="lazy" decoding="async" width={size} height={size} style={{ width: size, height: size }} className="shrink-0 rounded-lg border border-[#eceef1] bg-[#f3f4f6] object-cover" />
  ) : (
    <span style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-lg bg-[#f1f2f4]">
      <Package className="h-4 w-4 text-[#9ca3af]" />
    </span>
  )
}

export function InventoryClient({ initialView = "all" }: { initialView?: View } = {}) {
  const [rows, setRows] = React.useState<Row[] | null>(null)
  const [locations, setLocations] = React.useState<Location[]>([])
  const [lowStockDefault, setLowStockDefault] = React.useState(5)
  const [error, setError] = React.useState<string | null>(null)
  /* The low stock email links to ?filter=low, read by the server page (./page.tsx), so the first frame is the same on both sides. */
  const [view, setView] = React.useState<View>(initialView)
  const [query, setQuery] = React.useState("")
  const [loc, setLoc] = React.useState("")
  const [adjusting, setAdjusting] = React.useState<Row | null>(null)
  const [history, setHistory] = React.useState<Row | "all" | null>(null)
  const [transfers, setTransfers] = React.useState(false)
  const [imported, setImported] = React.useState<{ changed: number; unchanged: number; skipped: string[]; skippedCount: number } | null>(null)
  const fileInput = React.useRef<HTMLInputElement>(null)

  const load = React.useCallback(async () => {
    const r = await api<{ rows: Row[]; locations: Location[]; lowStockDefault: number }>("/api/physical/inventory")
    if (!r.ok) return setError(r.error)
    setError(null)
    setRows(r.data.rows)
    setLocations(r.data.locations)
    if (typeof r.data.lowStockDefault === "number") setLowStockDefault(r.data.lowStockDefault)
  }, [])
  React.useEffect(() => {
    void load()
  }, [load])

  const q = query.trim().toLowerCase()
  const shown = (rows ?? []).filter((r) => {
    if (q && !`${r.productTitle} ${r.variantName} ${r.sku ?? ""}`.toLowerCase().includes(q)) return false
    return inView(r, levelAt(r, loc), view)
  })
  const count = (v: View) => (rows ?? []).filter((r) => inView(r, levelAt(r, loc), v)).length

  const exportCsv = async () => {
    const path = `/api/physical/inventory/export${loc ? `?locationId=${loc}` : ""}`
    try {
      const outcome = await saveFile({
        name: `inventory-${new Date().toISOString().slice(0, 10)}.csv`,
        file: async () => {
          const res = await fetch(path, { credentials: "same-origin", cache: "no-store" })
          if (!res.ok) throw new Error(String(res.status))
          return res.blob()
        },
        link: async () => new URL(path, window.location.origin).toString(),
      })
      toast.success(savedMessage(outcome, tt("Inventory file")))
    } catch {
      toast.error(tt("The inventory file could not be made. Try again."))
    }
  }
  const importCsv = async (file: File) => {
    if (file.size > 1_000_000) return toast.error(tt("That file is too big. Import up to 2,000 lines at a time."))
    const csv = await file.text()
    const r = await api<{ changed: number; unchanged: number; skipped: string[]; skippedCount: number }>("/api/physical/inventory/import", { body: { csv } })
    if (!r.ok) return toast.error(r.error)
    setImported(r.data)
    toast.success(tt("{changed} updated, {unchanged} already right", { changed: r.data.changed, unchanged: r.data.unchanged }))
    void load()
  }
  const more: ActionMenuItem[] = [
    { label: tt("Stock history"), icon: <History />, onClick: () => setHistory("all") },
    { label: tt("Export CSV"), icon: <Download />, onClick: () => void exportCsv(), separatorBefore: true },
    { label: tt("Import CSV"), icon: <Upload />, onClick: () => fileInput.current?.click() },
  ]

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Inventory")}</h1>
        <div className="flex items-center gap-2">
          <button type="button" className={cn(BTN_SECONDARY, "h-9 px-3")} onClick={() => setTransfers(true)} data-inventory-transfers="">
            <ArrowRightLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{tt("Transfers")}</span>
          </button>
          <ResponsiveActionMenu
            title={tt("Inventory")}
            items={more}
            trigger={
              <button type="button" className={cn(BTN_SECONDARY, "h-9 w-9 px-0")} aria-label={tt("More")}>
                <MoreHorizontal className="h-4 w-4" />
              </button>
            }
          />
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ""
              if (f) void importCsv(f)
            }}
          />
        </div>
      </PaneBar>

      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        {error ? <Notice className="mt-3">{error}</Notice> : null}
        {imported && imported.skippedCount > 0 ? (
          <Notice tone="amber" className="mt-3">
            <span className="block font-medium">{tt("{count, plural, one {# line was skipped} other {# lines were skipped}}", { count: imported.skippedCount })}</span>
            {imported.skipped.slice(0, 5).map((s) => (
              <span key={s} className="block">
                {s}
              </span>
            ))}
          </Notice>
        ) : null}
        <section aria-label={tt("Inventory")} className={cn(card, "mt-3 overflow-hidden")}>
          <div className="flex flex-col gap-2 border-b border-[#eef0f2] px-2 py-2 md:flex-row md:items-center">
            <div role="tablist" aria-label={tt("Views")} className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={view === v.id}
                  onClick={() => setView(v.id)}
                  className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-[14px] font-medium transition-colors md:h-8 md:rounded-lg md:text-[13px]", view === v.id ? "bg-[#eceef1] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f4f5f7]")}
                >
                  {v.label}
                  <span className="tabular-nums text-[#9ca3af]">{rows ? count(v.id) : ""}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 px-1 md:px-0">
              <div className="relative min-w-0 flex-1 md:w-[220px] md:flex-none">
                <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
                <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tt("Search products or SKU")} className="h-10 pl-9 sm:h-9" />
              </div>
              {locations.length > 1 ? (
                <SelectInput value={loc} onChange={setLoc} className="w-[150px] shrink-0 sm:w-[170px] [&_select]:h-10 sm:[&_select]:h-9" aria-label={tt("Location")}>
                  <option value="">{tt("All locations")}</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </SelectInput>
              ) : null}
            </div>
          </div>

          {rows === null && !error ? (
            <div className="space-y-2 p-4" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-[#f4f5f7]" />
              ))}
            </div>
          ) : rows && rows.length === 0 ? (
            <Empty
              title={tt("No physical products yet")}
              action={
                <Link href="/app/products/new?type=physical" className={BTN_PRIMARY}>
                  <Package className="h-4 w-4" />
                  {tt("Add a physical product")}
                </Link>
              }
            >
              {tt("Stock shows here once you add a product you ship.")}
            </Empty>
          ) : shown.length === 0 ? (
            <Empty title={tt("Nothing here")}>{tt("No product matches this view.")}</Empty>
          ) : (
            <>
              <div className="hidden grid-cols-[minmax(0,2.4fr)_repeat(4,minmax(0,0.8fr))_auto] gap-3 border-b border-[#eef0f2] bg-[#fafafb] px-4 py-2 text-[12px] font-medium uppercase tracking-[0.02em] text-[#6b7280] md:grid">
                <span>{tt("Product")}</span>
                <span className="text-right">{tt("On hand")}</span>
                <span className="text-right">{tt("Committed")}</span>
                <span className="text-right">{tt("Available")}</span>
                <span className="text-right">{tt("Incoming")}</span>
                <span className="w-[120px]" />
              </div>
              <ul className="divide-y divide-[#f1f2f4]" data-inventory-rows="">
                {shown.map((r) => {
                  const l = levelAt(r, loc)
                  const state = stockState(l.available, r.lowStockThreshold, r.trackInventory)
                  return (
                    <li key={r.variantId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 md:grid-cols-[minmax(0,2.4fr)_repeat(4,minmax(0,0.8fr))_auto]" data-inventory-row={r.variantId}>
                      <div className="flex min-w-0 items-center gap-3">
                        <Thumb src={r.productImage} />
                        <div className="min-w-0">
                          <Link href={`/app/products/${r.productId}`} className="block truncate text-[14px] font-medium text-[#1a1a2e] hover:underline">
                            {r.productTitle}
                          </Link>
                          <p className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-[#6b7280]">
                            {r.variantName !== "Default" ? <span>{r.variantName}</span> : null}
                            {r.sku ? <span>SKU {r.sku}</span> : null}
                            <StateWord state={state} keepSelling={r.keepSelling} />
                          </p>
                          {r.trackInventory ? (
                            <p className="mt-0.5 text-[12.5px] text-[#4b5563] md:hidden">
                              {tt("{available} available · {onHand} on hand", { available: l.available, onHand: l.onHand })}
                              {l.committed ? tt(" · {committed} committed", { committed: l.committed }) : ""}
                              {l.incoming ? tt(" · {incoming} incoming", { incoming: l.incoming }) : ""}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <span className="hidden text-right text-[14px] tabular-nums text-[#1a1a2e] md:block">{r.trackInventory ? l.onHand : ""}</span>
                      <span className="hidden text-right text-[14px] tabular-nums text-[#6b7280] md:block">{r.trackInventory ? l.committed : ""}</span>
                      <span className={cn("hidden text-right text-[14px] font-medium tabular-nums md:block", state === "out" || state === "oversold" ? "text-[#b42318]" : "text-[#1a1a2e]")}>{r.trackInventory ? l.available : ""}</span>
                      <span className="hidden text-right text-[14px] tabular-nums text-[#6b7280] md:block">{r.trackInventory ? l.incoming : ""}</span>
                      <div className="flex w-auto items-center justify-end gap-1 md:w-[120px]">
                        <button type="button" className={cn(BTN_GHOST, "w-9 px-0")} aria-label={tt("History of {productTitle}", { productTitle: fullName(r) })} onClick={() => setHistory(r)}>
                          <History className="h-4 w-4" />
                        </button>
                        <button type="button" className={cn(BTN_SECONDARY, "h-9 px-3")} onClick={() => setAdjusting(r)} disabled={locations.length === 0} data-inventory-adjust="">
                          {tt("Adjust")}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </section>
        {rows && rows.length > 0 && locations.length === 0 ? (
          <Notice tone="amber" className="mt-3">
            {tt("Add a location in Settings to count stock.")}{" "}
            <Link href="/app/settings?tab=locations" className="font-medium underline">
              {tt("Locations")}
            </Link>
          </Notice>
        ) : null}
      </div>

      {adjusting ? <AdjustModal row={adjusting} locations={locations} defaultLocation={loc} lowStockDefault={lowStockDefault} onClose={() => setAdjusting(null)} onDone={load} /> : null}
      {history ? <HistoryModal row={history === "all" ? null : history} rows={rows ?? []} locations={locations} onClose={() => setHistory(null)} /> : null}
      {transfers ? <TransfersModal rows={rows ?? []} locations={locations} onClose={() => setTransfers(false)} onChanged={load} /> : null}
    </div>
  )
}

/* ── Adjust ───────────────────────────────────────────────────────────── */

const MODES: { id: AdjustMode; label: () => string }[] = [
  { id: "add", label: () => tt("Add") },
  { id: "remove", label: () => tt("Remove") },
  { id: "set", label: () => tt("Set to") },
]

/** The four numbers at a location, in one quiet row. */
function LevelRow({ level, after }: { level: { onHand: number; committed: number; available: number; incoming: number }; after?: { onHand?: number; available?: number } | null }) {
  const cells: [string, number, number | undefined][] = [
    [tt("On hand"), level.onHand, after?.onHand],
    [tt("Committed"), level.committed, undefined],
    [tt("Available"), level.available, after?.available],
    [tt("Incoming"), level.incoming, undefined],
  ]
  return (
    <dl className="grid grid-cols-4 divide-x divide-[#eceef1] rounded-xl bg-[#f8f9fa] py-2.5" data-adjust-levels="">
      {cells.map(([label, now, next]) => (
        <div key={label} className="min-w-0 px-2 text-center">
          <dt className="truncate text-[11.5px] font-medium text-[#6b7280]">{label}</dt>
          <dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-[#1a1a2e]">
            {next !== undefined && next !== now ? (
              <>
                <span className="text-[#9ca3af] line-through decoration-[#d1d5db]">{now}</span> <span className={next < 0 ? "text-[#b42318]" : ""}>{next}</span>
              </>
            ) : (
              now
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function AdjustModal({ row, locations, defaultLocation, lowStockDefault, onClose, onDone }: { row: Row; locations: Location[]; defaultLocation: string; lowStockDefault: number; onClose: () => void; onDone: () => void }) {
  const [locationId, setLocationId] = React.useState(defaultLocation || locations.find((l) => l.active && l.holdsInventory !== false)?.id || locations[0]?.id || "")
  const [mode, setMode] = React.useState<AdjustMode>("add")
  const [amount, setAmount] = React.useState("")
  const [reason, setReason] = React.useState<string>(REASONS_FOR.add[0])
  const [note, setNote] = React.useState("")
  const [track, setTrack] = React.useState(row.trackInventory)
  const [keepSelling, setKeepSelling] = React.useState(row.productKeepsSelling)
  const [lowAt, setLowAt] = React.useState(row.variantLowStock === null ? "" : String(row.variantLowStock))
  const level = row.levels.find((l) => l.locationId === locationId) ?? { onHand: 0, committed: 0, available: 0, incoming: 0 }
  const [onOrder, setOnOrder] = React.useState(String(level.incoming))
  const [settingsOpen, setSettingsOpen] = React.useState(!row.trackInventory)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const key = React.useRef(actionKey())

  /* Another location: its own units on order. */
  React.useEffect(() => setOnOrder(String((row.levels.find((l) => l.locationId === locationId) ?? { incoming: 0 }).incoming)), [locationId, row.levels])

  const counting = track && !row.madeToOrder
  const plan = amount.trim() === "" ? null : planAdjust(level, { field: "on_hand", mode, quantity: amount })
  const planned = plan && plan.ok ? (plan as Extract<typeof plan, { ok: true }>) : null
  const planError = plan && plan.ok === false ? (plan as { error: string }).error : null
  const orderPlan = onOrder.trim() !== "" && onOrder.trim() !== String(level.incoming) ? planAdjust(level, { field: "incoming", mode: "set", quantity: onOrder }) : null
  const orderError = orderPlan && orderPlan.ok === false ? (orderPlan as { error: string }).error : null
  const lowTyped = lowAt.trim()
  const lowValue = lowTyped === "" ? null : readUnits(lowTyped)
  const lowError = lowTyped !== "" && lowValue === null ? tt("A whole number from 0.") : null
  const inherited = row.productLowStock ?? lowStockDefault
  const settingsChanged = track !== row.trackInventory || keepSelling !== row.productKeepsSelling || lowValue !== row.variantLowStock
  const stockChanged = counting && !!planned && !planned.unchanged
  const orderChanged = counting && !!orderPlan && orderPlan.ok
  const canSave = !busy && !planError && !orderError && !lowError && !!locationId && (settingsChanged || stockChanged || orderChanged)
  const severalVariants = row.variantName !== "Default"

  const chooseMode = (m: AdjustMode) => {
    setMode(m)
    if (!REASONS_FOR[m].includes(reason as never)) setReason(REASONS_FOR[m][0])
    document.querySelector<HTMLInputElement>("[data-adjust-amount]")?.focus({ preventScroll: true })
  }
  const step = (by: number) => {
    const n = readUnits(amount) ?? 0
    setAmount(String(Math.max(0, n + by)))
  }

  const save = async () => {
    if (!canSave) return
    setBusy(true)
    setError(null)
    if (settingsChanged) {
      const body: Record<string, unknown> = { variantId: row.variantId }
      if (track !== row.trackInventory) body.trackInventory = track
      if (keepSelling !== row.productKeepsSelling) body.continueSelling = keepSelling
      if (lowValue !== row.variantLowStock) body.lowStockThreshold = lowValue
      const r = await api("/api/physical/inventory", { method: "PATCH", body })
      if (!r.ok) {
        setBusy(false)
        return setError(r.error)
      }
    }
    if (stockChanged) {
      const r = await api("/api/physical/inventory", { body: { variantId: row.variantId, locationId, field: "on_hand", mode, quantity: amount.trim(), reason, note, key: key.current } })
      if (!r.ok) {
        setBusy(false)
        /* The settings above were saved: the list shows them now, and Save again sends only what is left. */
        if (settingsChanged) onDone()
        return setError(r.error)
      }
    }
    if (orderChanged) {
      const r = await api("/api/physical/inventory", { body: { variantId: row.variantId, locationId, field: "incoming", mode: "set", quantity: onOrder.trim(), reason: "received", note, key: `${key.current}:incoming` } })
      if (!r.ok) {
        setBusy(false)
        /* What was saved before it is on the list; the same key makes Save again a no-op for it. */
        if (settingsChanged || stockChanged) onDone()
        return setError(r.error)
      }
    }
    setBusy(false)
    toast.success(stockChanged ? tt("Stock saved") : tt("Saved"))
    onDone()
    onClose()
  }

  const location = locations.find((l) => l.id === locationId)
  return (
    <Modal
      open
      onClose={onClose}
      title={tt("Adjust stock")}
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            {tt("Cancel")}
          </button>
          <button type="button" className={cn(BTN_PRIMARY, "min-w-[96px]")} onClick={save} disabled={!canSave} data-adjust-save="">
            {busy ? tt("Saving") : tt("Save")}
          </button>
        </>
      }
    >
      <div className="space-y-4" data-adjust-modal="">
        <div className="flex min-w-0 items-center gap-3">
          <Thumb src={row.productImage} size={44} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-[#1a1a2e]">{row.productTitle}</p>
            <p className="truncate text-[13px] text-[#6b7280]">{[row.variantName !== "Default" ? row.variantName : null, row.sku ? tt("SKU {sku}", { sku: row.sku }) : null].filter(Boolean).join(" · ") || tt("One variant")}</p>
          </div>
        </div>

        {locations.length > 1 ? (
          <Field label={tt("Location")}>
            <SelectInput value={locationId} onChange={setLocationId} data-adjust-location="">
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        ) : null}

        {counting ? (
          <>
            <LevelRow level={level} after={planned && !planned.unchanged ? { onHand: planned.after, available: planned.availableAfter } : null} />
            <div role="radiogroup" aria-label={tt("Change")} className="grid grid-cols-3 gap-1 rounded-xl bg-[#f1f2f4] p-1" data-adjust-modes="">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.id}
                  onClick={() => chooseMode(m.id)}
                  className={cn("h-9 rounded-lg text-[14px] font-medium transition-[background-color,color,box-shadow] duration-150", mode === m.id ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.1)]" : "text-[#6b7280] hover:text-[#1a1a2e]")}
                >
                  {m.label()}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3">
              <Field label={mode === "set" ? tt("On hand") : tt("Quantity")} error={planError}>
                <div className="flex items-stretch">
                  <button type="button" aria-label={tt("One less")} onClick={() => step(-1)} className="grid h-11 w-10 shrink-0 place-items-center rounded-l-lg border border-r-0 border-[#e5e7eb] bg-white text-[#4b5563] hover:bg-[#f7f7f8] sm:h-10">
                    <Minus className="h-4 w-4" />
                  </button>
                  <NumberInput value={amount} onChange={setAmount} placeholder={mode === "set" ? String(level.onHand) : "0"} className="rounded-none text-center" aria-label={mode === "set" ? tt("On hand") : tt("Quantity")} data-adjust-amount="" />
                  <button type="button" aria-label={tt("One more")} onClick={() => step(1)} className="grid h-11 w-10 shrink-0 place-items-center rounded-r-lg border border-l-0 border-[#e5e7eb] bg-white text-[#4b5563] hover:bg-[#f7f7f8] sm:h-10">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </Field>
              <Field label={tt("Reason")}>
                <SelectInput value={reason} onChange={setReason} data-adjust-reason="">
                  {REASONS_FOR[mode].map((r) => (
                    <option key={r} value={r}>
                      {r === "other" ? tt("Other") : REASON_LABEL[r]}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            {planned && planned.availableAfter < 0 && !planned.unchanged ? (
              <p className="text-[13px] leading-[18px] text-[#92400e]" data-adjust-warning="">
                {tt("{count, plural, one {# sold unit won't be on the shelf.} other {# sold units won't be on the shelf.}}", { count: -planned.availableAfter })}
              </p>
            ) : null}
            <Field label={tt("Note")}>
              <TextInput value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder={tt("Optional")} data-adjust-note="" />
            </Field>
          </>
        ) : (
          <p className="rounded-xl bg-[#f8f9fa] px-3 py-3 text-[13.5px] leading-5 text-[#4b5563]">
            {row.madeToOrder ? tt("A print partner makes this when it sells, so there is no stock to count.") : tt("Stock isn't counted for this product. Turn on Track stock to count it.")}
          </p>
        )}

        <div className="border-t border-[#f1f2f4] pt-1">
          <button type="button" onClick={() => setSettingsOpen((o) => !o)} aria-expanded={settingsOpen} className="flex h-10 w-full items-center justify-between text-left text-[14px] font-medium text-[#1a1a2e]" data-adjust-settings-toggle="">
            {tt("Stock settings")}
            <ChevronDown className={cn("h-4 w-4 text-[#9ca3af] transition-transform duration-200", settingsOpen && "rotate-180")} />
          </button>
          <Reveal open={settingsOpen}>
            <div className="space-y-4 pb-1 pt-2" data-adjust-settings="">
              {!row.madeToOrder ? <Toggle label={tt("Track stock")} checked={track} onChange={setTrack} /> : null}
              <Toggle label={tt("Keep selling when out of stock")} checked={keepSelling} onChange={setKeepSelling} />
              {severalVariants ? <p className="-mt-2 text-[12.5px] leading-[18px] text-[#6b7280]">{tt("Both apply to every variant of {title}.", { title: row.productTitle })}</p> : null}
              {counting ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={tt("Low stock at")} error={lowError} hint={lowTyped === "" ? tt("Empty: {line}", { line: inherited }) : undefined}>
                    <NumberInput value={lowAt} onChange={setLowAt} placeholder={String(inherited)} data-adjust-low="" />
                  </Field>
                  <Field label={location && locations.length > 1 ? tt("On order at {name}", { name: location.name }) : tt("Units on order")} error={orderError}>
                    <NumberInput value={onOrder} onChange={setOnOrder} data-adjust-incoming="" />
                  </Field>
                </div>
              ) : null}
            </div>
          </Reveal>
        </div>
        {error ? <Notice>{error}</Notice> : null}
      </div>
    </Modal>
  )
}

/* ── History ──────────────────────────────────────────────────────────── */

const SOURCE_LABEL: Record<MovementSource, () => string> = {
  manual: () => tt("You"),
  order: () => tt("Order"),
  return: () => tt("Return"),
  transfer: () => tt("Transfer"),
  import: () => tt("Import"),
  api: () => tt("API"),
  app: () => tt("Partner app"),
  product: () => tt("Product editor"),
}

function HistoryModal({ row, rows, locations, onClose }: { row: Row | null; rows: Row[]; locations: Location[]; onClose: () => void }) {
  const [moves, setMoves] = React.useState<Movement[] | null>(null)
  const [more, setMore] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [loc, setLoc] = React.useState("")
  const [failed, setFailed] = React.useState<string | null>(null)
  const path = React.useCallback(
    (before?: number) => {
      const p = new URLSearchParams()
      if (row) p.set("variantId", row.variantId)
      if (loc) p.set("locationId", loc)
      if (before) p.set("before", String(before))
      return `/api/physical/inventory/movements?${p.toString()}`
    },
    [row, loc],
  )
  React.useEffect(() => {
    let live = true
    setMoves(null)
    void api<{ movements: Movement[]; more: boolean }>(path()).then((r) => {
      if (!live) return
      if (!r.ok) return setFailed(r.error)
      setMoves(r.data.movements)
      setMore(!!r.data.more)
    })
    return () => {
      live = false
    }
  }, [path])
  const loadMore = async () => {
    const last = moves?.[moves.length - 1]
    if (!last) return
    setBusy(true)
    const r = await api<{ movements: Movement[]; more: boolean }>(path(last.id))
    setBusy(false)
    if (!r.ok) return toast.error(r.error)
    setMoves((m) => [...(m ?? []), ...r.data.movements])
    setMore(!!r.data.more)
  }
  const name = (id: string | null) => locations.find((l) => l.id === id)?.name ?? ""
  const product = (id: string | null) => {
    const r = rows.find((x) => x.variantId === id)
    return r ? fullName(r) : tt("A deleted product")
  }
  const signed = (n: number) => (n > 0 ? `+${n}` : String(n))
  return (
    <Modal open onClose={onClose} title={row ? tt("History: {name}", { name: fullName(row) }) : tt("Stock history")} wide>
      <div data-inventory-history="">
        {locations.length > 1 ? (
          <SelectInput value={loc} onChange={setLoc} className="mb-3 w-full sm:w-[220px]" aria-label={tt("Location")}>
            <option value="">{tt("All locations")}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </SelectInput>
        ) : null}
        {failed ? (
          <Notice>{failed}</Notice>
        ) : moves === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-[#f4f5f7]" />
            ))}
          </div>
        ) : moves.length === 0 ? (
          <Empty title={tt("No changes yet")} />
        ) : (
          <>
            <ul className="divide-y divide-[#f1f2f4]">
              {moves.map((m) => {
                const who = m.source === "manual" ? (m.by ?? (m.actor === "creator" ? tt("You") : "Storelib")) : SOURCE_LABEL[m.source]()
                return (
                  <li key={m.id} className="flex items-start justify-between gap-3 py-2.5" data-history-row={m.source}>
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-[#1a1a2e]">
                        {m.reason === "other" ? tt("Other") : m.reason === "transfer_cancelled" ? tt("Transfer cancelled") : (REASON_LABEL[m.reason] ?? m.reason)}
                        {!row ? <span className="font-normal text-[#6b7280]"> · {product(m.variantId)}</span> : null}
                      </p>
                      <p className="text-[12.5px] text-[#6b7280]">{[dateTime(m.createdAt), name(m.locationId), who, m.note].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="shrink-0 text-right text-[13px] tabular-nums">
                      {m.deltaOnHand ? (
                        <p className={m.deltaOnHand > 0 ? "text-[#166534]" : "text-[#b42318]"}>
                          {signed(m.deltaOnHand)} {tt("on hand")}
                        </p>
                      ) : null}
                      {m.deltaCommitted ? (
                        <p className="text-[#6b7280]">
                          {signed(m.deltaCommitted)} {tt("committed")}
                        </p>
                      ) : null}
                      {m.deltaIncoming ? (
                        <p className="text-[#6b7280]">
                          {signed(m.deltaIncoming)} {tt("incoming")}
                        </p>
                      ) : null}
                      {m.onHandBefore !== null && m.onHandAfter !== null && m.deltaOnHand ? <p className="text-[12px] text-[#9ca3af]">{`${m.onHandBefore} → ${m.onHandAfter}`}</p> : null}
                    </div>
                  </li>
                )
              })}
            </ul>
            {more ? (
              <div className="pt-3 text-center">
                <button type="button" className={cn(BTN_SECONDARY, "h-9")} onClick={loadMore} disabled={busy}>
                  {busy ? tt("Loading") : tt("Show more")}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  )
}

/* ── Transfers ────────────────────────────────────────────────────────── */

const TRANSFER_STATUS: Record<string, { label: string; tone: "gray" | "blue" | "green" | "amber" }> = {
  draft: { get label() { return tt("Draft") }, tone: "gray" },
  in_transit: { get label() { return tt("On its way") }, tone: "blue" },
  partially_received: { get label() { return tt("Partly received") }, tone: "amber" },
  received: { get label() { return tt("Received") }, tone: "green" },
  cancelled: { get label() { return tt("Cancelled") }, tone: "gray" },
}

function TransfersModal({ rows, locations, onClose, onChanged }: { rows: Row[]; locations: Location[]; onClose: () => void; onChanged: () => void }) {
  const [list, setList] = React.useState<Transfer[] | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [origin, setOrigin] = React.useState(locations[0]?.id ?? "")
  const [destination, setDestination] = React.useState(locations[1]?.id ?? "")
  const [qty, setQty] = React.useState<Record<string, string>>({})
  const [reference, setReference] = React.useState("")
  const [find, setFind] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState<string | null>(null)
  const [receiving, setReceiving] = React.useState<Record<string, string>>({})
  const [confirmCancel, setConfirmCancel] = React.useState<string | null>(null)
  const load = React.useCallback(async () => {
    const r = await api<{ transfers: Transfer[] }>("/api/physical/transfers")
    if (!r.ok) setError(r.error)
    setList(r.ok ? r.data.transfers : [])
  }, [])
  React.useEffect(() => {
    void load()
  }, [load])
  const name = (id: string | null) => locations.find((l) => l.id === id)?.name ?? tt("A location")
  const variantName = (id: string) => {
    const r = rows.find((x) => x.variantId === id)
    return r ? fullName(r) : tt("A product")
  }
  const act = async (t: Transfer, action: "ship" | "receive" | "cancel", items?: { itemId: string; quantity: number }[]) => {
    setError(null)
    setBusy(`${t.id}:${action}`)
    const r = await api(`/api/physical/transfers/${t.id}`, { body: action === "receive" ? { action, items } : { action } })
    setBusy(null)
    setConfirmCancel(null)
    if (!r.ok) return setError(r.error)
    toast.success(action === "ship" ? tt("Transfer sent") : action === "receive" ? tt("Stock received") : tt("Transfer cancelled"))
    if (action === "receive") setReceiving({})
    await load()
    onChanged()
  }
  const startReceive = (t: Transfer) => {
    setOpen(t.id)
    setReceiving(Object.fromEntries(t.inventory_transfer_items.map((i) => [i.id, String(Math.max(0, i.quantity - i.received_quantity))])))
  }
  const picked = Object.entries(qty)
    .map(([variantId, q]) => ({ variantId, quantity: readUnits(q) ?? 0 }))
    .filter((i) => i.quantity > 0)
  const sameLocation = origin === destination
  const create = async () => {
    setError(null)
    setBusy("create")
    const r = await api("/api/physical/transfers", { body: { originId: origin, destinationId: destination, items: picked, reference } })
    setBusy(null)
    if (!r.ok) return setError(r.error)
    setCreating(false)
    setQty({})
    setReference("")
    toast.success(tt("Transfer created"))
    await load()
  }
  if (locations.length < 2) {
    return (
      <Modal open onClose={onClose} title={tt("Transfers")}>
        <Empty title={tt("Add a second location first")}>{tt("Transfers move stock between two of your locations.")}</Empty>
      </Modal>
    )
  }
  const findWords = find.trim().toLowerCase()
  const choices = rows.filter((r) => r.trackInventory && (!findWords || `${r.productTitle} ${r.variantName} ${r.sku ?? ""}`.toLowerCase().includes(findWords)))
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={creating ? tt("New transfer") : tt("Transfers")}
      footer={
        creating ? (
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => setCreating(false)}>
              {tt("Back")}
            </button>
            <button type="button" className={BTN_PRIMARY} onClick={create} disabled={busy === "create" || picked.length === 0 || sameLocation} data-transfer-create="">
              {busy === "create" ? tt("Saving") : tt("Create transfer")}
            </button>
          </>
        ) : (
          <button type="button" className={BTN_PRIMARY} onClick={() => setCreating(true)} data-transfer-new="">
            {tt("New transfer")}
          </button>
        )
      }
    >
      {error ? <Notice className="mb-3">{error}</Notice> : null}
      {creating ? (
        <div className="space-y-4" data-transfer-form="">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={tt("From")}>
              <SelectInput value={origin} onChange={setOrigin}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label={tt("To")} error={sameLocation ? tt("Choose another location.") : null}>
              <SelectInput value={destination} onChange={setDestination}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label={tt("Reference")}>
              <TextInput value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} placeholder={tt("Optional")} />
            </Field>
          </div>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
            <TextInput value={find} onChange={(e) => setFind(e.target.value)} placeholder={tt("Search products or SKU")} className="pl-9" />
          </div>
          <ul className="divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]">
            {choices.length === 0 ? <li className="px-3 py-6 text-center text-[13.5px] text-[#6b7280]">{tt("No product matches.")}</li> : null}
            {choices.map((r) => {
              const at = r.levels.find((l) => l.locationId === origin)?.available ?? 0
              const want = readUnits(qty[r.variantId] ?? "") ?? 0
              return (
                <li key={r.variantId} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Thumb src={r.productImage} size={32} />
                    <div className="min-w-0">
                      <p className="truncate text-[14px] text-[#1a1a2e]">{fullName(r)}</p>
                      <p className={cn("text-[12px]", want > at ? "text-[#b42318]" : "text-[#6b7280]")}>{want > at ? tt("Only {at} available at {name}", { at: Math.max(0, at), name: name(origin) }) : tt("{at} available at {name}", { at, name: name(origin) })}</p>
                    </div>
                  </div>
                  <NumberInput value={qty[r.variantId] ?? ""} onChange={(v) => setQty((q) => ({ ...q, [r.variantId]: v }))} placeholder="0" className="w-[84px] text-right" aria-label={tt("Units of {name}", { name: fullName(r) })} />
                </li>
              )
            })}
          </ul>
        </div>
      ) : list === null ? (
        <div className="h-24 animate-pulse rounded-lg bg-[#f4f5f7]" />
      ) : list.length === 0 ? (
        <Empty title={tt("No transfers yet")}>{tt("Move stock from one location to another, like from a supplier to your warehouse.")}</Empty>
      ) : (
        <ul className="divide-y divide-[#f1f2f4]" data-transfer-list="">
          {list.map((t) => {
            const st = TRANSFER_STATUS[t.status] ?? TRANSFER_STATUS.draft
            const units = t.inventory_transfer_items.reduce((n, i) => n + i.quantity, 0)
            const got = t.inventory_transfer_items.reduce((n, i) => n + i.received_quantity, 0)
            const actions = transferActions(t.status)
            const expanded = open === t.id
            const isReceiving = expanded && Object.keys(receiving).length > 0 && actions.includes("receive")
            const plan = isReceiving ? receivePlan(t.inventory_transfer_items.map((i) => ({ id: i.id, quantity: i.quantity, received: i.received_quantity })), receiving) : null
            return (
              <li key={t.id} className="py-3" data-transfer={t.status}>
                <button type="button" className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen(expanded ? null : t.id)} aria-expanded={expanded}>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-[#1a1a2e]">
                      {name(t.origin_location_id)} → {name(t.destination_location_id)}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-[#6b7280]">
                      {t.status === "partially_received" ? tt("{got} of {units} received", { got, units }) : tt("{units, plural, one {# unit} other {# units}}", { units })} · {dateTime(t.created_at)}
                      {t.reference ? ` · ${t.reference}` : ""}
                    </p>
                  </div>
                  <Pill tone={st.tone}>{st.label}</Pill>
                </button>
                <Reveal open={expanded}>
                  <div className="pt-3">
                    <ul className="space-y-1.5">
                      {t.inventory_transfer_items.map((i) => (
                        <li key={i.id} className="flex items-center justify-between gap-3 text-[13.5px]">
                          <span className="min-w-0 truncate text-[#1a1a2e]">{variantName(i.variant_id)}</span>
                          {isReceiving && i.received_quantity < i.quantity ? (
                            <span className="flex shrink-0 items-center gap-2 text-[12.5px] text-[#6b7280]">
                              {tt("of {open}", { open: i.quantity - i.received_quantity })}
                              <NumberInput value={receiving[i.id] ?? ""} onChange={(v) => setReceiving((r) => ({ ...r, [i.id]: v }))} className="h-9 w-[72px] text-right sm:h-8" aria-label={tt("Arrived of {name}", { name: variantName(i.variant_id) })} data-transfer-arrived="" />
                            </span>
                          ) : (
                            <span className="shrink-0 tabular-nums text-[#6b7280]">{t.status === "draft" || t.status === "cancelled" ? i.quantity : `${i.received_quantity} / ${i.quantity}`}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {actions.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {actions.includes("send") ? (
                          <button type="button" className={cn(BTN_PRIMARY, "h-9")} onClick={() => act(t, "ship")} disabled={!!busy} data-transfer-send="">
                            {busy === `${t.id}:ship` ? tt("Sending") : tt("Mark as sent")}
                          </button>
                        ) : null}
                        {actions.includes("receive") && !isReceiving ? (
                          <button type="button" className={cn(BTN_PRIMARY, "h-9")} onClick={() => startReceive(t)} disabled={!!busy} data-transfer-receive="">
                            {tt("Receive")}
                          </button>
                        ) : null}
                        {isReceiving && plan ? (
                          <button
                            type="button"
                            className={cn(BTN_PRIMARY, "h-9")}
                            disabled={!!busy || plan.total === 0}
                            onClick={() => act(t, "receive", Object.entries(plan.take).map(([itemId, quantity]) => ({ itemId, quantity })))}
                            data-transfer-receive-confirm=""
                          >
                            <Check className="h-4 w-4" />
                            {busy === `${t.id}:receive` ? tt("Saving") : tt("Receive {count}", { count: plan.total })}
                          </button>
                        ) : null}
                        {actions.includes("cancel") ? (
                          confirmCancel === t.id ? (
                            <>
                              <button type="button" className={cn(BTN_SECONDARY, "h-9 border-[#fecaca] text-[#b42318] hover:bg-[#fef2f2]")} onClick={() => act(t, "cancel")} disabled={!!busy} data-transfer-cancel-confirm="">
                                {t.status === "draft" ? tt("Yes, cancel") : tt("Cancel and return {count}", { count: units - got })}
                              </button>
                              <button type="button" className={cn(BTN_GHOST, "h-9")} onClick={() => setConfirmCancel(null)}>
                                {tt("Keep")}
                              </button>
                            </>
                          ) : (
                            <button type="button" className={cn(BTN_GHOST, "h-9 text-[#b42318] hover:bg-[#fef2f2] hover:text-[#b42318]")} onClick={() => setConfirmCancel(t.id)} data-transfer-cancel="">
                              {tt("Cancel transfer")}
                            </button>
                          )
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </Reveal>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
