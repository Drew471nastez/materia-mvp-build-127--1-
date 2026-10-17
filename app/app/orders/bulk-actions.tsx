"use client"

/**
 * ===========================================================================
 *  MANY ORDERS AT ONCE: MARK AS FULFILLED, PACKING SLIPS, A TRACKING CSV
 * ===========================================================================
 * From the Orders list's selection bar (./orders-list.tsx). Each is the
 * app's own Modal: a dialog on a computer, the bottom sheet on a phone
 * (components/physical/ui.tsx). The server (app/api/physical/orders/bulk)
 * fulfils order by order and says, for each, what happened; nothing here
 * decides whether an order can be fulfilled.
 */
import * as React from "react"
import { FileUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { CARRIERS } from "@/lib/physical/status"
import { IMPORT_MAX_BYTES } from "@/lib/physical/bulk-fulfil"
import { BTN_PRIMARY, BTN_SECONDARY, Modal, Notice, SelectInput, Toggle, actionKey, api } from "@/components/physical/ui"
import { TrackingFields } from "@/components/physical/order-panel"
import { printPackingSlips, type SlipLine, type SlipOrder } from "@/components/physical/packing-slip"

/* The answers of app/api/physical/orders/bulk, as the page reads them. */
interface BulkLine {
  orderId: string
  title: string
  variantName: string | null
  sku: string | null
  open: number
}
interface BulkOrder {
  id: string
  checkoutId: string | null
  number: string
  buyerName: string | null
  lines: BulkLine[]
  refused: string | null
  order?: SlipOrder & { lines: (SlipLine & { orderId: string; fulfilled: number; requiresShipping: boolean })[] }
}
interface BulkResult {
  id: string
  number: string
  ok: boolean
  error: string | null
  units: number
  parcels: number
}
interface PreviewRow {
  line: number
  order: string
  carrier: string
  tracking: string
  sku: string
  quantity: number | null
  error: string | null
  number: string | null
  ships: string | null
}
interface Preview {
  error: string | null
  rows: PreviewRow[]
  counts: { orders: number; parcels: number; units: number; errors: number; rows: number }
}

/** A bulk press can fulfil a hundred orders: it is given longer than an ordinary save. */
const BULK_WAIT_MS = 120_000

const itemsLabel = (n: number) => tt("{n, plural, one {# item} other {# items}}", { n })
const ordersLabel = (n: number) => tt("{n, plural, one {# order} other {# orders}}", { n })

function useBulkOrders(ids: string[], open: boolean, slips = false) {
  const [state, setState] = React.useState<{ orders: BulkOrder[] | null; error: string | null }>({ orders: null, error: null })
  const want = open ? ids.join(",") : ""
  React.useEffect(() => {
    if (!want) return
    let live = true
    setState({ orders: null, error: null })
    void api<{ orders: BulkOrder[] }>("/api/physical/orders/bulk", { method: "POST", body: { action: "load", ids: want.split(","), slips } }).then((r) => {
      if (!live) return
      setState(r.ok ? { orders: r.data.orders, error: null } : { orders: null, error: r.error })
    })
    return () => {
      live = false
    }
  }, [want, slips])
  return state
}

/** Results, order by order: how many were fulfilled and why each other one was not. */
function Results({ results }: { results: BulkResult[] }) {
  const done = results.filter((r) => r.ok)
  const not = results.filter((r) => !r.ok)
  return (
    <div className="space-y-3" data-bulk-results="">
      <p className="text-[14px] text-[#1a1a2e]">
        {done.length
          ? tt("{orders} marked fulfilled, {items} in all.", { orders: ordersLabel(done.length), items: itemsLabel(done.reduce((n, r) => n + r.units, 0)) })
          : tt("No order was fulfilled.")}
      </p>
      {not.length ? (
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-[#4b5563]">{tt("Not fulfilled")}</p>
          <ul className="divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]">
            {not.map((r) => (
              <li key={r.id} className="flex items-baseline gap-3 px-3 py-2 text-[13px]">
                <span className="shrink-0 font-medium tabular-nums text-[#1a1a2e]">{r.number || tt("Order")}</span>
                <span className="min-w-0 text-[#b42318]">{r.error}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

interface RowDraft {
  carrier: string
  other: string
  tracking: string
  url: string
}

/**
 * MARK AS FULFILLED, for the orders ticked in the list. Each order is
 * listed with what it still has to ship and a tracking number of its own
 * (optional); one carrier can be picked for all of them first and changed
 * on any one. Orders that can't be fulfilled this way are listed apart with
 * the reason and left as they are.
 */
export function BulkFulfilSheet({ ids, open, onClose, onDone }: { ids: string[]; open: boolean; onClose: () => void; onDone: (message: string) => void }) {
  const { orders, error: loadError } = useBulkOrders(ids, open)
  const [shared, setShared] = React.useState("")
  const [rows, setRows] = React.useState<Record<string, RowDraft>>({})
  const [notify, setNotify] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [results, setResults] = React.useState<BulkResult[] | null>(null)
  const key = React.useRef(actionKey())
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setShared("")
      setRows({})
      setResults(null)
      setError(null)
      key.current = actionKey()
    }
  }
  const going = (orders ?? []).filter((o) => !o.refused)
  const left = (orders ?? []).filter((o) => o.refused)
  const units = going.reduce((n, o) => n + o.lines.reduce((m, l) => m + l.open, 0), 0)
  const blank = (): RowDraft => ({ carrier: shared, other: "", tracking: "", url: "" })
  const row = (id: string): RowDraft => rows[id] ?? blank()
  /* From the rows as they are now: a number typed and the carrier guessed from it land in the same render. */
  const patch = (id: string, p: Partial<RowDraft>) => setRows((all) => ({ ...all, [id]: { ...(all[id] ?? blank()), ...p } }))

  const submit = async () => {
    setBusy(true)
    setError(null)
    const r = await api<{ results: BulkResult[] }>("/api/physical/orders/bulk", {
      method: "POST",
      timeoutMs: BULK_WAIT_MS,
      body: {
        action: "fulfil",
        key: key.current,
        notifyBuyer: notify,
        orders: going.map((o) => {
          const d = row(o.id)
          return { id: o.id, carrier: (d.carrier === "Other" ? d.other.trim() : d.carrier) || null, trackingNumber: d.tracking.trim() || null, trackingUrl: d.carrier === "Other" ? d.url.trim() || null : null }
        }),
      },
    })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setResults(r.data.results)
    const n = r.data.results.filter((x) => x.ok).length
    onDone(n ? tt("{orders} marked fulfilled", { orders: ordersLabel(n) }) : tt("No order was fulfilled"))
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={results ? tt("Fulfilled") : tt("Mark as fulfilled")}
      wide
      footer={
        results ? (
          <button type="button" className={BTN_PRIMARY} onClick={onClose} data-bulk-done="">
            {tt("Done")}
          </button>
        ) : (
          <>
            <button type="button" className={BTN_SECONDARY} onClick={onClose}>
              {tt("Cancel")}
            </button>
            <button type="button" className={BTN_PRIMARY} disabled={busy || going.length === 0} onClick={submit} data-bulk-submit="">
              {busy ? tt("Saving…") : going.length ? tt("Mark {orders} fulfilled", { orders: ordersLabel(going.length) }) : tt("Mark as fulfilled")}
            </button>
          </>
        )
      }
    >
      {results ? (
        <Results results={results} />
      ) : loadError ? (
        <Notice>{loadError}</Notice>
      ) : !orders ? (
        <div className="space-y-3" aria-busy="true" data-bulk-loading="">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[92px] animate-pulse rounded-xl bg-[#f4f5f7]" />
          ))}
        </div>
      ) : (
        <div className="space-y-4" data-bulk-sheet="">
          <p className="text-[14px] leading-5 text-[#1a1a2e]" data-bulk-count="">
            {going.length
              ? tt("{orders} will be marked fulfilled, {items} in all. Each ships in one parcel with everything it has left.", { orders: ordersLabel(going.length), items: itemsLabel(units) })
              : tt("None of these orders can be marked fulfilled here.")}
            {left.length ? <span className="text-[#6b7280]"> {tt("{orders} can't be and stay as they are.", { orders: ordersLabel(left.length) })}</span> : null}
          </p>
          {going.length ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-[#1a1a2e]">{tt("Carrier for every order")}</span>
                <SelectInput
                  value={shared}
                  data-bulk-carrier=""
                  onChange={(v) => {
                    setShared(v)
                    /* Every order takes it; any one can be changed after. */
                    setRows((all) => Object.fromEntries(going.map((o) => [o.id, { ...(all[o.id] ?? { other: "", tracking: "", url: "" }), carrier: v }])))
                  }}
                >
                  <option value="">{tt("Choose a carrier")}</option>
                  {CARRIERS.map((c) => (
                    <option key={c} value={c}>
                      {c === "Other" ? tt("Other") : c}
                    </option>
                  ))}
                </SelectInput>
              </label>
              <p className="text-[12.5px] leading-[18px] text-[#6b7280] sm:max-w-[220px] sm:pb-2.5">{tt("Tracking numbers are optional. Change the carrier on any order below.")}</p>
            </div>
          ) : null}
          {going.length ? (
            <ol className="space-y-2.5" data-bulk-orders="">
              {going.map((o) => {
                const d = row(o.id)
                const count = o.lines.reduce((n, l) => n + l.open, 0)
                return (
                  <li key={o.id} className="rounded-xl border border-[#eceef1] bg-white px-3 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]" data-bulk-order={o.number}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-[14px] text-[#1a1a2e]">
                        <span className="font-semibold tabular-nums">{o.number}</span>
                        {o.buyerName ? <span className="text-[#6b7280]"> · {o.buyerName}</span> : null}
                      </p>
                      <span className="shrink-0 text-[12.5px] tabular-nums text-[#6b7280]">{itemsLabel(count)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[12.5px] text-[#6b7280]">{o.lines.map((l) => `${l.open} × ${l.title}${l.variantName ? ` (${l.variantName})` : ""}`).join(", ")}</p>
                    <div className="mt-2.5">
                      {/* Remounted when the shared carrier changes, so a typed number never guesses over it. */}
                      <TrackingFields
                        key={shared}
                        tracking={d.tracking}
                        setTracking={(v) => patch(o.id, { tracking: v })}
                        carrier={d.carrier}
                        setCarrier={(v) => patch(o.id, { carrier: v })}
                        other={d.other}
                        setOther={(v) => patch(o.id, { other: v })}
                        url={d.url}
                        setUrl={(v) => patch(o.id, { url: v })}
                      />
                    </div>
                  </li>
                )
              })}
            </ol>
          ) : null}
          {left.length ? (
            <div data-bulk-left="">
              <p className="mb-1.5 text-[13px] font-medium text-[#4b5563]">{tt("Left as they are")}</p>
              <ul className="divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]">
                {left.map((o) => (
                  <li key={o.id} className="flex items-baseline gap-3 px-3 py-2 text-[13px]">
                    <span className="shrink-0 font-medium tabular-nums text-[#1a1a2e]">{o.number || tt("Order")}</span>
                    <span className="min-w-0 text-[#6b7280]">{o.refused}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {going.length ? <Toggle label={tt("Email each buyer")} description={tt("One email per order with its tracking link, or saying it's on the way.")} checked={notify} onChange={setNotify} /> : null}
          {error ? <Notice>{error}</Notice> : null}
        </div>
      )}
    </Modal>
  )
}

/** Packing slips for the ticked orders, one page each, in one print. */
export async function printSelectedSlips(ids: string[]): Promise<string> {
  const r = await api<{ orders: BulkOrder[] }>("/api/physical/orders/bulk", { method: "POST", body: { action: "load", ids, slips: true } })
  if (!r.ok) return r.error
  const slips = r.data.orders
    .filter((o) => o.order && o.lines.length > 0)
    .map((o) => ({ order: { ...o.order!, number: o.number }, lines: o.lines.map((l) => ({ title: l.title, variantName: l.variantName, sku: l.sku, quantity: l.open })) }))
  if (slips.length === 0) return tt("None of these orders has anything left to pack.")
  printPackingSlips(slips)
  const skipped = r.data.orders.length - slips.length
  return skipped ? tt("{printed} printed. {skipped} had nothing left to pack.", { printed: ordersLabel(slips.length), skipped: ordersLabel(skipped) }) : tt("Packing slips for {orders}", { orders: ordersLabel(slips.length) })
}

/**
 * IMPORT TRACKING: a CSV of order numbers, carriers and tracking numbers
 * (SKU and quantity to split an order into parcels). Read and checked by
 * the server first: every row is shown with what it ships or what is wrong
 * with it, and nothing is saved until Import is pressed.
 */
export function ImportTrackingSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (message: string) => void }) {
  const [csv, setCsv] = React.useState<{ name: string; text: string } | null>(null)
  const [preview, setPreview] = React.useState<Preview | null>(null)
  const [results, setResults] = React.useState<BulkResult[] | null>(null)
  const [notify, setNotify] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const key = React.useRef(actionKey())
  const input = React.useRef<HTMLInputElement>(null)
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setCsv(null)
      setPreview(null)
      setResults(null)
      setError(null)
      key.current = actionKey()
    }
  }

  const read = async (file: File | null | undefined) => {
    if (!file) return
    setError(null)
    setPreview(null)
    if (file.size > IMPORT_MAX_BYTES) return setError(tt("That file is larger than 512 KB. Split it and import each part."))
    const text = await file.text()
    setCsv({ name: file.name, text })
    setBusy(true)
    const r = await api<{ preview: Preview }>("/api/physical/orders/bulk", { method: "POST", body: { action: "preview", csv: text } })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setPreview(r.data.preview)
    key.current = actionKey()
  }

  const run = async () => {
    if (!csv) return
    setBusy(true)
    setError(null)
    const r = await api<{ results: BulkResult[] }>("/api/physical/orders/bulk", { method: "POST", timeoutMs: BULK_WAIT_MS, body: { action: "import", csv: csv.text, key: key.current, notifyBuyer: notify } })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setResults(r.data.results)
    const n = r.data.results.filter((x) => x.ok).length
    onDone(n ? tt("Tracking imported for {orders}", { orders: ordersLabel(n) }) : tt("No order was fulfilled"))
  }

  const c = preview?.counts
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={results ? tt("Tracking imported") : tt("Import tracking")}
      wide
      footer={
        results ? (
          <button type="button" className={BTN_PRIMARY} onClick={onClose}>
            {tt("Done")}
          </button>
        ) : (
          <>
            <button type="button" className={BTN_SECONDARY} onClick={onClose}>
              {tt("Cancel")}
            </button>
            <button type="button" className={BTN_PRIMARY} disabled={busy || !c || c.orders === 0} onClick={run} data-import-submit="">
              {busy && preview ? tt("Importing…") : c && c.orders ? tt("Import {orders}", { orders: ordersLabel(c.orders) }) : tt("Import")}
            </button>
          </>
        )
      }
    >
      {results ? (
        <Results results={results} />
      ) : (
        <div className="space-y-4" data-import-sheet="">
          <p className="text-[14px] leading-5 text-[#4b5563]">
            {tt("A CSV with the columns Order, Carrier and Tracking number. Add SKU and Quantity to split an order into parcels. You see what each row does before anything is saved.")}
          </p>
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} onChange={(e) => void read(e.target.files?.[0])} data-import-file="" />
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-[#d5d7dd] bg-[#fafafb] px-4 py-4 text-left transition-colors hover:border-[#9ca3af] hover:bg-white"
            data-import-pick=""
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#e5e7eb] bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
              <FileUp className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{csv ? csv.name : tt("Choose a CSV file")}</span>
              <span className="block text-[12.5px] text-[#6b7280]">{csv ? tt("Choose another file") : tt("Up to 512 KB and 2,000 rows")}</span>
            </span>
          </button>
          {busy && !preview ? <div className="h-24 animate-pulse rounded-xl bg-[#f4f5f7]" aria-busy="true" /> : null}
          {preview && c ? (
            <div className="space-y-3" data-import-preview="">
              <p className="text-[14px] leading-5 text-[#1a1a2e]" data-import-count="">
                {c.orders
                  ? tt("Import marks {orders} fulfilled: {parcels} and {items}.", { orders: ordersLabel(c.orders), parcels: tt("{n, plural, one {# parcel} other {# parcels}}", { n: c.parcels }), items: itemsLabel(c.units) })
                  : tt("Nothing in this file can be imported yet.")}
                {c.errors ? <span className="text-[#b42318]"> {tt("{rows} with a problem. An order with a problem on any row is left out whole.", { rows: tt("{n, plural, one {# row} other {# rows}}", { n: c.errors }) })}</span> : null}
              </p>
              <ul className="max-h-[360px] divide-y divide-[#f1f2f4] overflow-y-auto rounded-xl border border-[#eceef1]" data-import-rows="">
                {preview.rows.map((r) => (
                  <li key={r.line} className="grid grid-cols-[auto_1fr] gap-x-3 px-3 py-2 text-[13px]" data-import-row={r.error ? "error" : "ok"}>
                    <span className="pt-px tabular-nums text-[#9ca3af]">{tt("Row {n}", { n: r.line })}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[#1a1a2e]">
                        <span className="font-medium tabular-nums">{r.number ?? r.order}</span>
                        {r.carrier || r.tracking ? <span className="text-[#6b7280]"> · {[r.carrier, r.tracking].filter(Boolean).join(" ")}</span> : null}
                      </span>
                      <span className={cn("block", r.error ? "text-[#b42318]" : "text-[#6b7280]")}>{r.error ?? r.ships}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {c.orders ? <Toggle label={tt("Email each buyer")} description={tt("One email per order listing its parcels and tracking links.")} checked={notify} onChange={setNotify} /> : null}
            </div>
          ) : null}
          <p className="text-[12.5px] text-[#6b7280]">
            {tt("Need the orders to ship first?")}{" "}
            <a href="/api/physical/orders/export" className="font-medium text-[#1a1a2e] underline underline-offset-2">
              {tt("Download the pick list")}
            </a>
          </p>
          {error ? <Notice>{error}</Notice> : null}
        </div>
      )}
    </Modal>
  )
}
