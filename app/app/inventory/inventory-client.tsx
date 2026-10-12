"use client"

/**
 * ===========================================================================
 *  INVENTORY: WHAT IS ON THE SHELF, WHAT IS SOLD, WHAT IS COMING
 * ===========================================================================
 * Every physical variant, one row, with on hand, committed (sold or held,
 * not shipped), available and incoming, for all locations or one. A change
 * is an adjustment with a reason (received, count, damaged...) and lands in
 * the history; transfers move stock between locations in two steps, sent
 * and received. Everything goes through /api/physical/inventory and the
 * stock functions behind it, so two people changing stock at once can't
 * lose a change.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRightLeft, History, Package, Search, SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { GUTTER, LIST_BAR, LIST_WIDTH, PaneBar, card } from "../orders/order-parts"
import { REASON_LABEL } from "@/lib/physical/inventory-server-labels"
import type { Location } from "@/lib/physical/types"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, Empty, Field, Modal, Notice, NumberInput, Pill, SelectInput, TextInput, actionKey, api, dateTime } from "@/components/physical/ui"
import { tt } from "@/lib/i18n/text"

interface Level {
  variantId: string
  locationId: string
  onHand: number
  committed: number
  incoming: number
  available: number
}
interface Row {
  variantId: string
  productId: string
  productTitle: string
  productImage: string | null
  variantName: string
  sku: string | null
  trackInventory: boolean
  lowStockThreshold: number
  levels: Level[]
  onHand: number
  committed: number
  available: number
  incoming: number
}
interface Movement {
  id: number
  variantId: string | null
  locationId: string | null
  deltaOnHand: number
  deltaCommitted: number
  deltaIncoming: number
  onHandAfter: number | null
  reason: string
  note: string | null
  actor: string
  createdAt: string
}
interface Transfer {
  id: string
  origin_location_id: string | null
  destination_location_id: string | null
  status: string
  reference: string | null
  created_at: string
  inventory_transfer_items: { id: string; variant_id: string; quantity: number; received_quantity: number }[]
}

type View = "all" | "low" | "out" | "incoming"
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

export function InventoryClient() {
  const [rows, setRows] = React.useState<Row[] | null>(null)
  const [locations, setLocations] = React.useState<Location[]>([])
  const [error, setError] = React.useState<string | null>(null)
  /* The low stock email links to ?filter=low. */
  const [view, setView] = React.useState<View>(() => {
    if (typeof window === "undefined") return "all"
    const f = new URLSearchParams(window.location.search).get("filter")
    return f === "low" || f === "out" || f === "incoming" ? f : "all"
  })
  const [query, setQuery] = React.useState("")
  const [loc, setLoc] = React.useState("")
  const [adjusting, setAdjusting] = React.useState<Row | null>(null)
  const [history, setHistory] = React.useState<Row | null>(null)
  const [transfers, setTransfers] = React.useState(false)

  const load = React.useCallback(async () => {
    const r = await api<{ rows: Row[]; locations: Location[] }>("/api/physical/inventory")
    if (!r.ok) return setError(r.error)
    setRows(r.data.rows)
    setLocations(r.data.locations)
  }, [])
  React.useEffect(() => {
    void load()
  }, [load])

  const q = query.trim().toLowerCase()
  const shown = (rows ?? []).filter((r) => {
    const l = levelAt(r, loc)
    if (q && !`${r.productTitle} ${r.variantName} ${r.sku ?? ""}`.toLowerCase().includes(q)) return false
    if (view === "low") return r.trackInventory && l.available > 0 && l.available <= r.lowStockThreshold
    if (view === "out") return r.trackInventory && l.available <= 0
    if (view === "incoming") return l.incoming > 0
    return true
  })
  const count = (v: View) =>
    (rows ?? []).filter((r) => {
      const l = levelAt(r, loc)
      if (v === "low") return r.trackInventory && l.available > 0 && l.available <= r.lowStockThreshold
      if (v === "out") return r.trackInventory && l.available <= 0
      if (v === "incoming") return l.incoming > 0
      return true
    }).length

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter">
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Inventory")}</h1>
        <button type="button" className={BTN_SECONDARY} onClick={() => setTransfers(true)}>
          <ArrowRightLeft className="h-4 w-4" />
          {tt("Transfers")}
        </button>
      </PaneBar>

      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        {error ? <Notice className="mt-3">{error}</Notice> : null}
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
              <div className="relative flex-1 md:w-[220px] md:flex-none">
                <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
                <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tt("Search products or SKU")} className="h-10 pl-9 sm:h-9" />
              </div>
              {locations.length > 1 ? (
                <SelectInput value={loc} onChange={setLoc} className="w-[160px]" aria-label={tt("Location")}>
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
              <ul className="divide-y divide-[#f1f2f4]">
                {shown.map((r) => {
                  const l = levelAt(r, loc)
                  const low = r.trackInventory && l.available > 0 && l.available <= r.lowStockThreshold
                  const out = r.trackInventory && l.available <= 0
                  return (
                    <li key={r.variantId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 md:grid-cols-[minmax(0,2.4fr)_repeat(4,minmax(0,0.8fr))_auto]">
                      <div className="flex min-w-0 items-center gap-3">
                        {r.productImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.productImage} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-[#eceef1] object-cover" />
                        ) : (
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#f1f2f4]">
                            <Package className="h-4 w-4 text-[#9ca3af]" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <Link href={`/app/products/${r.productId}`} className="block truncate text-[14px] font-medium text-[#1a1a2e] hover:underline">
                            {r.productTitle}
                          </Link>
                          <p className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-[#6b7280]">
                            {r.variantName !== "Default" ? <span>{r.variantName}</span> : null}
                            {r.sku ? <span>SKU {r.sku}</span> : null}
                            {!r.trackInventory ? <span>{tt("Not tracked")}</span> : out ? <Pill tone="red">{tt("Out of stock")}</Pill> : low ? <Pill tone="amber">{tt("Low")}</Pill> : null}
                          </p>
                          <p className="mt-0.5 text-[12.5px] text-[#4b5563] md:hidden">
                            <span className="font-medium text-[#1a1a2e]">{l.available}</span> {tt("available · {onHand} on hand", { onHand: l.onHand })}{l.committed ? tt(" · {committed} committed", { committed: l.committed }) : ""}
                            {l.incoming ? tt(" · {incoming} incoming", { incoming: l.incoming }) : ""}
                          </p>
                        </div>
                      </div>
                      <span className="hidden text-right text-[14px] tabular-nums text-[#1a1a2e] md:block">{l.onHand}</span>
                      <span className="hidden text-right text-[14px] tabular-nums text-[#6b7280] md:block">{l.committed}</span>
                      <span className={cn("hidden text-right text-[14px] font-medium tabular-nums md:block", out ? "text-[#b42318]" : "text-[#1a1a2e]")}>{l.available}</span>
                      <span className="hidden text-right text-[14px] tabular-nums text-[#6b7280] md:block">{l.incoming}</span>
                      <div className="flex w-auto items-center justify-end gap-1 md:w-[120px]">
                        <button type="button" className={cn(BTN_GHOST, "w-9 px-0")} aria-label={tt("History of {productTitle}", { productTitle: r.productTitle })} onClick={() => setHistory(r)}>
                          <History className="h-4 w-4" />
                        </button>
                        <button type="button" className={cn(BTN_SECONDARY, "h-9 px-3")} onClick={() => setAdjusting(r)} disabled={locations.length === 0}>
                          <SlidersHorizontal className="h-4 w-4" />
                          <span className="hidden sm:inline">{tt("Adjust")}</span>
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </section>
      </div>

      {adjusting ? <AdjustModal row={adjusting} locations={locations} defaultLocation={loc} onClose={() => setAdjusting(null)} onDone={load} /> : null}
      {history ? <HistoryModal row={history} locations={locations} onClose={() => setHistory(null)} /> : null}
      {transfers ? <TransfersModal rows={rows ?? []} locations={locations} onClose={() => setTransfers(false)} onChanged={load} /> : null}
    </div>
  )
}

const REASONS = ["received", "count", "correction", "damaged", "theft_or_loss", "promotion_or_donation", "returned_restock"] as const

function AdjustModal({ row, locations, defaultLocation, onClose, onDone }: { row: Row; locations: Location[]; defaultLocation: string; onClose: () => void; onDone: () => void }) {
  const [locationId, setLocationId] = React.useState(defaultLocation || locations.find((l) => l.active)?.id || "")
  const [mode, setMode] = React.useState<"delta" | "set" | "incoming">("delta")
  const [amount, setAmount] = React.useState("")
  const [reason, setReason] = React.useState<(typeof REASONS)[number]>("received")
  const [note, setNote] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const key = React.useRef(actionKey())
  const level = row.levels.find((l) => l.locationId === locationId)
  const save = async () => {
    setBusy(true)
    setError(null)
    const n = Number.parseInt(amount, 10)
    const body =
      mode === "set"
        ? { variantId: row.variantId, locationId, set: n, reason: reason === "received" ? "count" : reason, note, key: key.current }
        : mode === "incoming"
          ? { variantId: row.variantId, locationId, field: "incoming", delta: n, note, key: key.current }
          : { variantId: row.variantId, locationId, delta: n, reason, note, key: key.current }
    const r = await api("/api/physical/inventory", { body })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onDone()
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={tt("Adjust {productTitle}{value}", { productTitle: row.productTitle, value: row.variantName !== "Default" ? `, ${row.variantName}` : "" })}
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            {tt("Cancel")}
          </button>
          <button type="button" className={BTN_PRIMARY} onClick={save} disabled={busy || !amount || !locationId || (mode !== "set" && Number(amount) === 0)}>
            {busy ? tt("Saving") : tt("Save")}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={tt("Location")}>
          <SelectInput value={locationId} onChange={setLocationId}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <p className="text-[13px] text-[#6b7280]">
          {tt("Now:")} <span className="font-medium text-[#1a1a2e]">{level?.onHand ?? 0}</span> {tt("on hand,")} {level?.committed ?? 0} {tt("committed,")} {level?.incoming ?? 0} {tt("incoming")}
        </p>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#f1f2f4] p-1">
          {(
            [
              ["delta", tt("Add or remove")],
              ["set", tt("Set count")],
              ["incoming", tt("Incoming")],
            ] as const
          ).map(([m, label]) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={cn("h-9 rounded-lg text-[13px] font-medium", mode === m ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6b7280]")}>
              {label}
            </button>
          ))}
        </div>
        <Field label={mode === "set" ? tt("Counted on hand") : mode === "incoming" ? tt("Units on order (use a minus to cancel)") : tt("Change (use a minus to remove)")}>
          <NumberInput allowNegative={mode !== "set"} value={amount} onChange={setAmount} placeholder={mode === "set" ? String(level?.onHand ?? 0) : "+10"} />
        </Field>
        {mode !== "incoming" ? (
          <Field label={tt("Reason")}>
            <SelectInput value={reason} onChange={(v) => setReason(v as (typeof REASONS)[number])}>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {REASON_LABEL[r]}
                </option>
              ))}
            </SelectInput>
          </Field>
        ) : null}
        <Field label={tt("Note")} hint={tt("Optional, for your history")}>
          <TextInput value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error ? <Notice>{error}</Notice> : null}
      </div>
    </Modal>
  )
}

function HistoryModal({ row, locations, onClose }: { row: Row; locations: Location[]; onClose: () => void }) {
  const [moves, setMoves] = React.useState<Movement[] | null>(null)
  React.useEffect(() => {
    void api<{ movements: Movement[] }>(`/api/physical/inventory/movements?variantId=${row.variantId}`).then((r) => setMoves(r.ok ? r.data.movements : []))
  }, [row.variantId])
  const name = (id: string | null) => locations.find((l) => l.id === id)?.name ?? ""
  const delta = (n: number) => (n > 0 ? `+${n}` : String(n))
  return (
    <Modal open onClose={onClose} title={`History: ${row.productTitle}${row.variantName !== "Default" ? `, ${row.variantName}` : ""}`} wide>
      {moves === null ? (
        <div className="h-24 animate-pulse rounded-lg bg-[#f4f5f7]" />
      ) : moves.length === 0 ? (
        <Empty title={tt("No changes yet")} />
      ) : (
        <ul className="divide-y divide-[#f1f2f4]">
          {moves.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-[#1a1a2e]">{REASON_LABEL[m.reason] ?? m.reason}</p>
                <p className="text-[12.5px] text-[#6b7280]">
                  {[dateTime(m.createdAt), name(m.locationId), m.actor === "creator" ? tt("You") : m.actor === "buyer" ? tt("Checkout") : "Storelib", m.note].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="shrink-0 text-right text-[13px] tabular-nums">
                {m.deltaOnHand ? <p className={m.deltaOnHand > 0 ? "text-[#166534]" : "text-[#b42318]"}>{delta(m.deltaOnHand)} {tt("on hand")}</p> : null}
                {m.deltaCommitted ? <p className="text-[#6b7280]">{delta(m.deltaCommitted)} {tt("committed")}</p> : null}
                {m.deltaIncoming ? <p className="text-[#6b7280]">{delta(m.deltaIncoming)} {tt("incoming")}</p> : null}
                {m.onHandAfter !== null ? <p className="text-[12px] text-[#9ca3af]">{tt("{onHandAfter} after", { onHandAfter: m.onHandAfter })}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

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
  const [error, setError] = React.useState<string | null>(null)
  const load = React.useCallback(async () => {
    const r = await api<{ transfers: Transfer[] }>("/api/physical/transfers")
    setList(r.ok ? r.data.transfers : [])
  }, [])
  React.useEffect(() => {
    void load()
  }, [load])
  const name = (id: string | null) => locations.find((l) => l.id === id)?.name ?? tt("A location")
  const variantName = (id: string) => {
    const r = rows.find((x) => x.variantId === id)
    return r ? `${r.productTitle}${r.variantName !== "Default" ? `, ${r.variantName}` : ""}` : tt("A product")
  }
  const act = async (t: Transfer, action: "ship" | "receive" | "cancel") => {
    setError(null)
    const body = action === "receive" ? { action, items: t.inventory_transfer_items.map((i) => ({ itemId: i.id, quantity: i.quantity - i.received_quantity })) } : { action }
    const r = await api(`/api/physical/transfers/${t.id}`, { body })
    if (!r.ok) return setError(r.error)
    await load()
    onChanged()
  }
  if (locations.length < 2) {
    return (
      <Modal open onClose={onClose} title={tt("Transfers")}>
        <Empty title={tt("Add a second location first")}>{tt("Transfers move stock between two of your locations.")}</Empty>
      </Modal>
    )
  }
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={tt("Transfers")}
      footer={
        creating ? (
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => setCreating(false)}>
              {tt("Cancel")}
            </button>
            <button
              type="button"
              className={BTN_PRIMARY}
              onClick={async () => {
                const items = Object.entries(qty)
                  .map(([variantId, q]) => ({ variantId, quantity: Number.parseInt(q, 10) || 0 }))
                  .filter((i) => i.quantity > 0)
                const r = await api("/api/physical/transfers", { body: { originId: origin, destinationId: destination, items, reference } })
                if (!r.ok) return setError(r.error)
                setCreating(false)
                setQty({})
                setReference("")
                await load()
              }}
            >
              {tt("Create transfer")}
            </button>
          </>
        ) : (
          <button type="button" className={BTN_PRIMARY} onClick={() => setCreating(true)}>
            {tt("New transfer")}
          </button>
        )
      }
    >
      {error ? <Notice className="mb-3">{error}</Notice> : null}
      {creating ? (
        <div className="space-y-4">
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
            <Field label={tt("To")}>
              <SelectInput value={destination} onChange={setDestination}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label={tt("Reference")} hint={tt("Optional")}>
              <TextInput value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </div>
          <ul className="divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]">
            {rows
              .filter((r) => r.trackInventory)
              .map((r) => {
                const at = r.levels.find((l) => l.locationId === origin)?.available ?? 0
                return (
                  <li key={r.variantId} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] text-[#1a1a2e]">{variantName(r.variantId)}</p>
                      <p className="text-[12px] text-[#6b7280]">{tt("{at} available at {name}", { at, name: name(origin) })}</p>
                    </div>
                    <NumberInput value={qty[r.variantId] ?? ""} onChange={(v) => setQty((q) => ({ ...q, [r.variantId]: v }))} placeholder="0" className="w-[90px] text-right" aria-label={tt("Units of {name}", { name: variantName(r.variantId) })} />
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
        <ul className="space-y-2">
          {list.map((t) => {
            const st = TRANSFER_STATUS[t.status] ?? TRANSFER_STATUS.draft
            const units = t.inventory_transfer_items.reduce((n, i) => n + i.quantity, 0)
            return (
              <li key={t.id} className="rounded-xl border border-[#eceef1] px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[14px] font-medium text-[#1a1a2e]">
                    {name(t.origin_location_id)} → {name(t.destination_location_id)}
                  </p>
                  <Pill tone={st.tone}>{st.label}</Pill>
                </div>
                <p className="mt-0.5 text-[12.5px] text-[#6b7280]">
                  {units} {units === 1 ? "unit" : "units"} · {dateTime(t.created_at)}
                  {t.reference ? ` · ${t.reference}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.status === "draft" ? (
                    <button type="button" className={cn(BTN_PRIMARY, "h-9")} onClick={() => act(t, "ship")}>
                      {tt("Mark as sent")}
                    </button>
                  ) : null}
                  {t.status === "in_transit" || t.status === "partially_received" ? (
                    <button type="button" className={cn(BTN_PRIMARY, "h-9")} onClick={() => act(t, "receive")}>
                      {tt("Receive all")}
                    </button>
                  ) : null}
                  {t.status !== "received" && t.status !== "cancelled" ? (
                    <button type="button" className={cn(BTN_SECONDARY, "h-9")} onClick={() => act(t, "cancel")}>
                      {tt("Cancel")}
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
