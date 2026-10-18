"use client"

/**
 * ===========================================================================
 *  BUY A LABEL, IN FULFILL ITEMS
 * ===========================================================================
 * With Shippo or EasyPost connected (Settings › Integrations), Fulfill items
 * asks one thing first: Add tracking (you bought the label elsewhere) or Buy
 * a label (here). Buy a label is three short steps in the same dialog, as
 * Shopify has it:
 *
 *   1  the package (Settings › Shipping › Packages, the default first, or a
 *      size typed in) and the weight, the items' own plus the box
 *   2  Get rates: the provider's live rates for the order's address and the
 *      location's, cheapest first, with anything it found wrong with the
 *      delivery address above them
 *   3  pick one and Buy: the label opens to print, the items ship with its
 *      tracking number and the buyer gets the shipping email
 *
 * The server decides everything that costs money (app/api/physical/orders/
 * [id]/label): the price is read back from the provider, never taken from
 * this page.
 */

import * as React from "react"
import { Check, ExternalLink, Printer } from "lucide-react"
import { cn } from "@/lib/utils"
import { dimensionUnitFor, fromGrams, formatSize, toGrams, toMm, weightUnitFor, type UnitSystem } from "@/lib/physical/units"
import { DecimalInput, Field, Notice, SelectInput, api } from "./ui"
import { tt } from "@/lib/i18n/text"

export interface LabelView {
  id: string
  provider: "shippo" | "easypost"
  providerName: string
  carrier: string | null
  service: string | null
  trackingNumber: string | null
  labelUrl: string | null
  cents: number
  currency: string
  cost: string
  status: "buying" | "purchased" | "void_pending" | "voided" | "void_rejected"
  testMode: boolean
  fulfillmentId: string | null
  createdAt: string
}

interface PackageRow {
  id: string
  name: string
  kind: string
  lengthMm: number
  widthMm: number
  heightMm: number
  weightGrams: number
  isDefault: boolean
}

interface Options {
  ready: boolean
  apps: { id: "shippo" | "easypost"; name: string; test: boolean }[]
  packages: PackageRow[]
  defaultPackageId: string | null
  unitSystem: UnitSystem
  itemsGrams: number
  /** One unit of each line, in grams: the weight follows the items chosen. Absent from an older server. */
  lineGrams?: Record<string, number>
  from: { locationId: string; name: string; line: string; address: unknown | null } | null
  to: { line: string; complete: boolean }
  labels: LabelView[]
}

interface Rate {
  id: string
  shipmentId: string
  carrier: string
  service: string
  cents: number
  currency: string
  days: number | null
  price: string
}

interface Quote {
  provider: "shippo" | "easypost"
  shipmentId: string
  rates: Rate[]
  addressOk: boolean
  warnings: string[]
}

const labelPath = (orderId: string) => `/api/physical/orders/${encodeURIComponent(orderId)}/label`
const CUSTOM = "custom"

/** The order's labels, read again when its shipments change: what the shipment cards print and void. */
export function useOrderLabels(orderId: string | null, key: string): [LabelView[], (labels: LabelView[]) => void] {
  const [labels, setLabels] = React.useState<LabelView[]>([])
  React.useEffect(() => {
    if (!orderId || !key) return
    let live = true
    void fetch(`${labelPath(orderId)}?only=labels`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && d && Array.isArray(d.labels)) setLabels(d.labels)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [orderId, key])
  return [labels, setLabels]
}

export async function voidLabelRequest(orderId: string, labelId: string): Promise<{ ok: true; order: any; label: LabelView } | { ok: false; error: string }> {
  const r = await api<{ order: any; label: LabelView }>(labelPath(orderId), { body: { action: "void", labelId } })
  return r.ok ? { ok: true, order: r.data.order, label: r.data.label } : { ok: false, error: r.error }
}

/** Ship with this label, on a bought label the order shows without a shipment. */
export async function shipLabelRequest(orderId: string, labelId: string, notifyBuyer: boolean): Promise<{ ok: true; order: any; label: LabelView } | { ok: false; error: string }> {
  const r = await api<{ order: any; label: LabelView }>(labelPath(orderId), { body: { action: "ship", labelId, notifyBuyer } })
  return r.ok ? { ok: true, order: r.data.order, label: r.data.label } : { ok: false, error: r.error }
}

/**
 * A bought label with no live shipment: its shipment was cancelled, or the
 * items could not be marked shipped after it was bought. The order shows it
 * on its own, to print, ship with or void, so a paid label is never lost.
 */
export function labelsWithoutShipment(labels: LabelView[], shipments: { id: string; status: string }[]): LabelView[] {
  const live = new Set(shipments.filter((s) => s.status !== "cancelled").map((s) => s.id))
  return labels.filter((l) => (l.status === "purchased" || l.status === "void_rejected") && !(l.fulfillmentId && live.has(l.fulfillmentId)))
}

/** The parcel's weight for the items chosen: each line's own weight, else the order's total for the open items. */
export function chosenGrams(options: Pick<Options, "itemsGrams" | "lineGrams">, items: { orderId: string; quantity: number }[]): number {
  if (!options.lineGrams) return options.itemsGrams
  return Math.round(items.reduce((g, i) => g + (options.lineGrams![i.orderId] ?? 0) * Math.max(0, i.quantity), 0))
}

export type ShipMode = "tracking" | "label"

/**
 * The state of the label flow for one Fulfill items dialog, and the
 * footer's button for it. Reads the options once when the dialog opens.
 */
export function useLabelFlow({ orderId, locationId, items, notify, enabled, onBought, onKept }: { orderId: string; locationId: string | null; items: { orderId: string; quantity: number }[]; notify: boolean; enabled: boolean; onBought: (order: any, label: LabelView) => void; onKept?: (label: LabelView) => void }) {
  const [options, setOptions] = React.useState<Options | null>(null)
  const [mode, setMode] = React.useState<ShipMode>("tracking")
  const [provider, setProvider] = React.useState<"shippo" | "easypost" | "">("")
  const [packageId, setPackageId] = React.useState("")
  const [dims, setDims] = React.useState({ l: "", w: "", h: "" })
  const [weight, setWeight] = React.useState("")
  const [quote, setQuote] = React.useState<Quote | null>(null)
  const [picked, setPicked] = React.useState("")
  const [busy, setBusy] = React.useState<null | "rates" | "buy">(null)
  const [error, setError] = React.useState<string | null>(null)
  const [bought, setBought] = React.useState<LabelView | null>(null)
  /* Typed by the seller: then it stays as typed, whatever the items. */
  const [weighed, setWeighed] = React.useState(false)
  const itemsKey = items.map((i) => `${i.orderId}:${i.quantity}`).join(",")

  React.useEffect(() => {
    if (!enabled) return
    let live = true
    const q = locationId ? `?locationId=${encodeURIComponent(locationId)}` : ""
    void api<Options>(`${labelPath(orderId)}${q}`).then((r) => {
      if (!live || !r.ok) return
      setOptions(r.data)
      if (r.data.apps[0]) setProvider(r.data.apps[0].id)
      const def = r.data.defaultPackageId ?? r.data.packages[0]?.id ?? ""
      setPackageId(def || CUSTOM)
      const pkg = r.data.packages.find((p) => p.id === def)
      const grams = chosenGrams(r.data, items) + (pkg?.weightGrams ?? 0)
      setWeight(grams > 0 ? String(fromGrams(grams, weightUnitFor(r.data.unitSystem)) ?? "") : "")
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once per dialog; the items' weight follows below
  }, [enabled, orderId, locationId])

  /* Fewer items chosen (a partial shipment), a lighter parcel: the weight follows until the seller types one. */
  React.useEffect(() => {
    if (!options || weighed) return
    const grams = chosenGrams(options, items) + (options.packages.find((p) => p.id === packageId)?.weightGrams ?? 0)
    const next = grams > 0 ? String(fromGrams(grams, weightUnitFor(options.unitSystem)) ?? "") : ""
    if (next === weight) return
    setWeight(next)
    setQuote(null)
    setPicked("")
    // eslint-disable-next-line react-hooks/exhaustive-deps -- itemsKey stands for items; the weight is read, not watched
  }, [itemsKey, options, weighed])

  /* Anything that changes the parcel makes the rates shown stale. */
  const stale = () => {
    setQuote(null)
    setPicked("")
    setError(null)
  }
  const system = options?.unitSystem ?? "metric"
  const wUnit = weightUnitFor(system)
  const dUnit = dimensionUnitFor(system)

  const choosePackage = (id: string) => {
    if (!options) return
    const before = options.packages.find((p) => p.id === packageId)?.weightGrams ?? 0
    const after = options.packages.find((p) => p.id === id)?.weightGrams ?? 0
    const now = toGrams(weight, wUnit)
    /* The box's own weight follows the box, so the total stays right without retyping it. */
    if (now !== null && now > 0) setWeight(String(fromGrams(Math.max(1, now - before + after), wUnit) ?? weight))
    setPackageId(id)
    stale()
  }

  const getRates = async () => {
    if (!provider) return
    setBusy("rates")
    setError(null)
    setQuote(null)
    setPicked("")
    const grams = toGrams(weight, wUnit)
    const custom = packageId === CUSTOM ? { lengthCm: (toMm(dims.l, dUnit) ?? 0) / 10, widthCm: (toMm(dims.w, dUnit) ?? 0) / 10, heightCm: (toMm(dims.h, dUnit) ?? 0) / 10 } : null
    const r = await api<Quote>(labelPath(orderId), { body: { action: "rates", provider, locationId, packageId: packageId === CUSTOM ? null : packageId, custom, grams, items: items.filter((i) => i.quantity > 0) } })
    setBusy(null)
    if (!r.ok) return setError(r.error)
    setQuote(r.data)
    setPicked(r.data.rates[0]?.id ?? "")
    if (r.data.rates.length === 0) setError(tt("No rates came back for this parcel. Check its size and weight, and the addresses."))
  }

  const buy = async () => {
    if (!quote || !picked) return
    setBusy("buy")
    setError(null)
    const r = await api<{ order: any; label: LabelView }>(labelPath(orderId), {
      body: { action: "buy", provider: quote.provider, shipmentId: quote.shipmentId, rateId: picked, locationId, items: items.filter((i) => i.quantity > 0), notifyBuyer: notify, packageName: options?.packages.find((p) => p.id === packageId)?.name ?? null },
    })
    setBusy(null)
    if (r.ok === false) {
      /* Bought, but its items could not be marked shipped: the order shows the label, to print, ship with or void. */
      const kept = (r as { data?: Record<string, unknown> }).data?.label as LabelView | null | undefined
      if (kept?.id) onKept?.(kept)
      return setError((r as { error: string }).error)
    }
    setBought(r.data.label)
    onBought(r.data.order, r.data.label)
    /* The label, to print: a new tab where the browser allows one; the Print label button otherwise. */
    if (r.data.label.labelUrl) {
      try {
        window.open(r.data.label.labelUrl, "_blank", "noopener")
      } catch {
        /* Blocked: the button below opens it. */
      }
    }
  }

  const rate = quote?.rates.find((x) => x.id === picked) ?? null
  const chosen = items.reduce((n, i) => n + i.quantity, 0)
  const canQuote = !!provider && !!options?.to.complete && !!options?.from?.address && (toGrams(weight, wUnit) ?? 0) > 0 && (packageId !== CUSTOM || (Number(dims.l) > 0 && Number(dims.w) > 0 && Number(dims.h) > 0))
  const footer = bought
    ? null
    : quote && rate
      ? { label: busy === "buy" ? tt("Buying label…") : tt("Buy label · {price}", { price: rate.price }), disabled: busy !== null || chosen === 0, onClick: () => void buy() }
      : { label: busy === "rates" ? tt("Getting rates…") : tt("Get rates"), disabled: busy !== null || !canQuote || chosen === 0, onClick: () => void getRates() }

  return {
    options,
    available: !!options && options.apps.length > 0,
    mode,
    setMode: (m: ShipMode) => {
      setMode(m)
      setError(null)
    },
    provider,
    setProvider: (p: "shippo" | "easypost") => {
      setProvider(p)
      stale()
    },
    packageId,
    choosePackage,
    dims,
    setDims: (d: { l: string; w: string; h: string }) => {
      setDims(d)
      stale()
    },
    weight,
    setWeight: (w: string) => {
      setWeight(w)
      setWeighed(true)
      stale()
    },
    wUnit,
    dUnit,
    system,
    quote,
    picked,
    setPicked,
    busy,
    error,
    bought,
    footer,
  }
}

export type LabelFlow = ReturnType<typeof useLabelFlow>

/** Add tracking or Buy a label: shown only while a label app is connected. */
export function ShipModeSwitch({ flow }: { flow: LabelFlow }) {
  if (!flow.available || flow.bought) return null
  return (
    <div role="radiogroup" aria-label={tt("How it ships")} className="grid grid-cols-2 gap-1 rounded-xl bg-[#f1f2f4] p-1" data-ship-mode="">
      {(["tracking", "label"] as const).map((m) => {
        const on = flow.mode === m
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => flow.setMode(m)}
            className={cn("h-9 rounded-lg text-[13.5px] font-medium transition-[background-color,color,box-shadow] duration-150 [-webkit-tap-highlight-color:transparent]", on ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "text-[#4b5563] hover:text-[#1a1a2e]")}
            data-ship-mode-option={m}
          >
            {m === "tracking" ? tt("Add tracking") : tt("Buy a label")}
          </button>
        )
      })}
    </div>
  )
}

export function LabelFields({ flow }: { flow: LabelFlow }) {
  const o = flow.options
  if (!o) return null
  if (flow.bought) return <Bought label={flow.bought} />
  if (!o.ready) return <Notice tone="amber">{tt("Labels turn on after the database update (SQL part 163).")}</Notice>
  const many = o.apps.length > 1
  return (
    <div className="space-y-3" data-label-fields="">
      <dl className="grid gap-1.5 rounded-xl border border-[#eceef1] px-3 py-2.5 text-[13px] leading-[18px]">
        <div className="flex gap-2">
          <dt className="w-10 shrink-0 text-[#6b7280]">{tt("From")}</dt>
          <dd className={cn("min-w-0", o.from?.address ? "text-[#1a1a2e]" : "text-[#b54708]")} data-label-from="">{o.from ? (o.from.address ? `${o.from.name}, ${o.from.line}` : o.from.line) : tt("Add a location with its address in Settings › Locations.")}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-10 shrink-0 text-[#6b7280]">{tt("To")}</dt>
          <dd className={cn("min-w-0", o.to.complete ? "text-[#1a1a2e]" : "text-[#b54708]")}>{o.to.line}</dd>
        </div>
      </dl>

      <div className={cn("grid gap-3", many ? "sm:grid-cols-2" : "")}>
        {many ? (
          <Field label={tt("Label from")}>
            <SelectInput value={flow.provider} onChange={(v) => flow.setProvider(v as "shippo" | "easypost")} data-label-provider="">
              {o.apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.test ? " (test)" : ""}
                </option>
              ))}
            </SelectInput>
          </Field>
        ) : null}
        <Field label={tt("Package")} hint={o.packages.length === 0 ? tt("Save your boxes in Settings › Shipping › Packages to pick them here.") : undefined}>
          <SelectInput value={flow.packageId} onChange={flow.choosePackage} data-label-package="">
            {o.packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatSize(p.lengthMm, p.widthMm, p.heightMm, flow.system)}
                {p.id === o.defaultPackageId ? " (default)" : ""}
              </option>
            ))}
            <option value={CUSTOM}>{tt("Custom size")}</option>
          </SelectInput>
        </Field>
      </div>
      {flow.packageId === CUSTOM ? (
        <div className="grid grid-cols-3 gap-2" data-label-custom="">
          {(["l", "w", "h"] as const).map((k) => (
            <Field key={k} label={k === "l" ? tt("Length") : k === "w" ? tt("Width") : tt("Height")}>
              <DecimalInput value={flow.dims[k]} onChange={(v) => flow.setDims({ ...flow.dims, [k]: v })} suffix={<Unit>{flow.dUnit}</Unit>} />
            </Field>
          ))}
        </div>
      ) : null}
      <Field label={tt("Total weight")} hint={o.itemsGrams > 0 ? tt("The items as sold, plus the empty package.") : tt("These products have no weight saved: weigh the parcel.")}>
        <DecimalInput value={flow.weight} onChange={flow.setWeight} suffix={<Unit>{flow.wUnit}</Unit>} data-label-weight="" />
      </Field>

      {flow.quote && flow.quote.warnings.length > 0 ? (
        <Notice tone="amber" className="space-y-0.5">
          {flow.quote.warnings.map((w) => (
            <p key={w} data-label-warning="">{w}</p>
          ))}
        </Notice>
      ) : null}

      {flow.quote && flow.quote.rates.length > 0 ? (
        <div role="radiogroup" aria-label={tt("Rates")} className="divide-y divide-[#f1f2f4] overflow-hidden rounded-xl border border-[#e5e7eb]" data-label-rates="">
          {flow.quote.rates.map((r) => {
            const on = flow.picked === r.id
            return (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => flow.setPicked(r.id)}
                className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors [-webkit-tap-highlight-color:transparent]", on ? "bg-[#f7f7f9]" : "bg-white hover:bg-[#fafafb]")}
                data-label-rate={r.id}
              >
                <span aria-hidden className={cn("grid h-4 w-4 shrink-0 place-items-center rounded-full border", on ? "border-[#1a1a2e]" : "border-[#c9ccd3]")}>
                  {on ? <span className="h-2 w-2 rounded-full bg-[#1a1a2e]" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-[#1a1a2e]">
                    {r.carrier} {r.service}
                  </span>
                  <span className="block text-[12px] text-[#6b7280]">{r.days ? `${r.days} ${r.days === 1 ? tt("business day") : tt("business days")}` : tt("Delivery time not given")}</span>
                </span>
                <span className="shrink-0 text-[14px] font-medium tabular-nums text-[#1a1a2e]">{r.price}</span>
              </button>
            )
          })}
        </div>
      ) : null}
      {flow.quote && flow.quote.rates.length > 0 ? <p className="text-[12px] leading-[17px] text-[#6b7280]">{tt("Charged to your")} {o.apps.find((a) => a.id === flow.quote!.provider)?.name ?? "label"} {tt("account and kept on the order as your cost. The buyer pays nothing more.")}</p> : null}
      {o.apps.find((a) => a.id === flow.provider)?.test ? <p className="text-[12px] text-[#b54708]" data-label-test="">{tt("Test key: the label is a free sample and can't be shipped.")}</p> : null}
      {flow.error ? <Notice>{flow.error}</Notice> : null}
    </div>
  )
}

/* The unit inside a size or weight field, dark enough to read (4.8:1 on white). */
function Unit({ children }: { children: React.ReactNode }) {
  return <span className="text-[#6b7280]">{children}</span>
}

function Bought({ label }: { label: LabelView }) {
  return (
    <div className="space-y-3" data-label-bought="">
      <div className="flex items-start gap-3 rounded-xl border border-[#d1fadf] bg-[#f6fef9] px-3.5 py-3">
        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#12b76a] text-white">
          <Check className="h-3 w-3" aria-hidden />
        </span>
        <div className="min-w-0 text-[13.5px] leading-5">
          <p className="font-medium text-[#1a1a2e]">
            {tt("Label bought: {carrier} {service}, {cost}", { carrier: label.carrier, service: label.service, cost: label.cost })}
          </p>
          <p className="text-[#4b5563]">{label.trackingNumber ? tt("Tracking {trackingNumber}. The items are marked shipped.", { trackingNumber: label.trackingNumber }) : tt("The items are marked shipped.")}</p>
          {label.testMode ? <p className="text-[#b54708]">{tt("Test label: don't ship with it.")}</p> : null}
        </div>
      </div>
      {label.labelUrl ? (
        <a href={label.labelUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#1a1a2e] px-4 text-[14px] font-medium text-white hover:bg-[#2a2a44] sm:h-10" data-label-print="">
          <Printer className="h-4 w-4" aria-hidden />
          {tt("Print label")}
          <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
        </a>
      ) : null}
    </div>
  )
}
