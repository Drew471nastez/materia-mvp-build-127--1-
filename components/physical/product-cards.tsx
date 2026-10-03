"use client"

/**
 * ===========================================================================
 *  A PHYSICAL PRODUCT IN THE PRODUCT EDITOR: STOCK, SHIPPING, VARIANTS
 * ===========================================================================
 * Shown in place of Digital Files and the digital Variants card when the
 * product is physical (app/app/products/new/product-editor.tsx). The editor
 * saves the product row as it always has, then asks these cards to save
 * theirs through `handle.save(productId)` (PUT /api/physical/products/[id]),
 * so a new product gets its options, variants and stock in the same Save.
 *
 *   Inventory   track quantity, how many are on hand at each location,
 *               keep selling when out, SKU, barcode, cost and margin
 *   Shipping    ships or not, weight, size, where it ships from, its
 *               shipping profile, and customs (origin, HS code)
 *   Variants    up to three options (Size, Color...) and every combination
 *               as a row with its own price, cost, SKU and stock
 *
 * Stock typed here is a count: the server records the difference as a
 * movement in the history (lib/physical/inventory-server.ts).
 */

import * as React from "react"
import Link from "next/link"
import { ChevronDown, Plus, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { COUNTRIES } from "@/lib/checkout/countries"
import { combinationKey, combinations, normaliseOptions, variantName, type Combination } from "@/lib/physical/variants"
import { fromGrams, fromMm, toGrams, toMm, type DimensionUnit, type WeightUnit } from "@/lib/physical/units"
import { marginPercent } from "@/lib/physical/totals"
import type { Location, PhysicalVariant, ProductOption } from "@/lib/physical/types"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { BTN_GHOST, BTN_SECONDARY, Card, DecimalInput, FIELD, Field, MoneyInput, Notice, NumberInput, SelectInput, TextInput, Toggle, api, centsOf, dollarsOf } from "./ui"

export interface PhysicalEditorHandle {
  /** A sentence for what must be fixed before saving, or null. */
  check: () => string | null
  /** Saves everything physical for the product; a sentence on failure, else null. */
  save: (productId: string) => Promise<string | null>
}

interface Row {
  id: string | null
  options: Combination
  price: string
  compareAt: string
  cost: string
  sku: string
  barcode: string
  weight: string
  active: boolean
  /** location id → on hand typed */
  stock: Record<string, string>
  /** location id → on hand / committed when loaded */
  loadedOnHand: Record<string, number>
  committed: Record<string, number>
}

interface OptionDraft {
  name: string
  values: string[]
  draft: string
}

interface Context {
  locations: Location[]
  profiles: { id: string; name: string; isDefault: boolean }[]
}

interface ProductData {
  vendor: string | null
  tags: string[]
  requiresShipping: boolean
  weightGrams: number | null
  lengthMm: number | null
  widthMm: number | null
  heightMm: number | null
  weightUnit: WeightUnit
  dimensionUnit: DimensionUnit
  originCountry: string | null
  hsCode: string | null
  taxable: boolean
  trackInventory: boolean
  continueSelling: boolean
  lowStockThreshold: number | null
  fulfillmentLocationId: string | null
  shippingProfileId: string | null
  options: ProductOption[]
  variants: PhysicalVariant[]
  levels: { variantId: string; locationId: string; onHand: number; committed: number }[]
}

function emptyRow(options: Combination): Row {
  return { id: null, options, price: "", compareAt: "", cost: "", sku: "", barcode: "", weight: "", active: true, stock: {}, loadedOnHand: {}, committed: {} }
}

function rowsFrom(p: ProductData, unit: WeightUnit): Row[] {
  return p.variants
    .filter((v) => v.active || v.options.some(Boolean) || p.variants.length === 1)
    .filter((v) => !/^Archived /.test(v.name))
    .map((v) => {
      const levels = p.levels.filter((l) => l.variantId === v.id)
      return {
        id: v.id,
        options: v.options as Combination,
        price: dollarsOf(v.priceCents),
        compareAt: dollarsOf(v.compareAtCents),
        cost: dollarsOf(v.costCents),
        sku: v.sku ?? "",
        barcode: v.barcode ?? "",
        weight: v.weightGrams !== null && v.weightGrams !== p.weightGrams ? String(fromGrams(v.weightGrams, unit) ?? "") : "",
        active: v.active,
        stock: Object.fromEntries(levels.map((l) => [l.locationId, String(l.onHand)])),
        loadedOnHand: Object.fromEntries(levels.map((l) => [l.locationId, l.onHand])),
        committed: Object.fromEntries(levels.map((l) => [l.locationId, l.committed])),
      }
    })
}

export function PhysicalProductCards(props: { productId: string | null; basePrice: string; handle: React.MutableRefObject<PhysicalEditorHandle | null>; onDirty: () => void }) {
  const enabled = usePhysicalCommerceEnabled()
  if (!enabled) {
    /* Switched off in /admin: nothing physical is read or written, and nothing is lost. */
    props.handle.current = { check: () => null, save: async () => null }
    return <Notice tone="gray">Physical commerce is turned off on Storelib right now. This product's variants, stock and shipping are kept as they are and come back when it's on.</Notice>
  }
  return <Cards {...props} />
}

function Cards({ productId, basePrice, handle, onDirty }: { productId: string | null; basePrice: string; handle: React.MutableRefObject<PhysicalEditorHandle | null>; onDirty: () => void }) {
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [ctx, setCtx] = React.useState<Context>({ locations: [], profiles: [] })

  const [requiresShipping, setRequiresShipping] = React.useState(true)
  const [weight, setWeight] = React.useState("")
  const [weightUnit, setWeightUnit] = React.useState<WeightUnit>("kg")
  const [dims, setDims] = React.useState({ l: "", w: "", h: "" })
  const [dimUnit, setDimUnit] = React.useState<DimensionUnit>("cm")
  const [origin, setOrigin] = React.useState("")
  const [hsCode, setHsCode] = React.useState("")
  const [profileId, setProfileId] = React.useState("")
  const [shipsFrom, setShipsFrom] = React.useState("")
  const [trackInventory, setTrackInventory] = React.useState(true)
  const [continueSelling, setContinueSelling] = React.useState(false)
  const [lowStock, setLowStock] = React.useState("")
  const [vendor, setVendor] = React.useState("")
  const [tags, setTags] = React.useState("")
  const [customsOpen, setCustomsOpen] = React.useState(false)

  const [options, setOptions] = React.useState<OptionDraft[]>([])
  const [rows, setRows] = React.useState<Row[]>([emptyRow([null, null, null])])
  const [stockAt, setStockAt] = React.useState("")
  const [openRow, setOpenRow] = React.useState<string | null>(null)

  const apply = React.useCallback((p: ProductData) => {
    setRequiresShipping(p.requiresShipping)
    setWeightUnit(p.weightUnit)
    setWeight(p.weightGrams === null ? "" : String(fromGrams(p.weightGrams, p.weightUnit) ?? ""))
    setDimUnit(p.dimensionUnit)
    setDims({ l: p.lengthMm ? String(fromMm(p.lengthMm, p.dimensionUnit)) : "", w: p.widthMm ? String(fromMm(p.widthMm, p.dimensionUnit)) : "", h: p.heightMm ? String(fromMm(p.heightMm, p.dimensionUnit)) : "" })
    setOrigin(p.originCountry ?? "")
    setHsCode(p.hsCode ?? "")
    setCustomsOpen(!!(p.originCountry || p.hsCode))
    setProfileId(p.shippingProfileId ?? "")
    setShipsFrom(p.fulfillmentLocationId ?? "")
    setTrackInventory(p.trackInventory)
    setContinueSelling(p.continueSelling)
    setLowStock(p.lowStockThreshold === null ? "" : String(p.lowStockThreshold))
    setVendor(p.vendor ?? "")
    setTags((p.tags ?? []).join(", "))
    setOptions(p.options.map((o) => ({ name: o.name, values: o.values, draft: "" })))
    const loaded = rowsFrom(p, p.weightUnit)
    setRows(loaded.length ? loaded : [emptyRow([null, null, null])])
  }, [])

  React.useEffect(() => {
    let gone = false
    ;(async () => {
      const context = await api<Context>("/api/physical/catalog-context")
      if (gone) return
      if (!context.ok) {
        setLoadError(context.error)
        setLoading(false)
        return
      }
      setCtx(context.data)
      setStockAt(context.data.locations.find((l) => l.active)?.id ?? "")
      if (productId) {
        const got = await api<{ product: ProductData }>(`/api/physical/products/${productId}`)
        if (gone) return
        if (got.ok) apply(got.data.product)
        else setLoadError(got.error)
      }
      setLoading(false)
    })()
    return () => {
      gone = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const changed = React.useCallback(
    <T,>(set: React.Dispatch<React.SetStateAction<T>>) =>
      (v: React.SetStateAction<T>) => {
        set(v)
        onDirty()
      },
    [onDirty],
  )

  /* The rows follow the options: every combination, keeping what was typed for each. */
  const normalised = React.useMemo(() => normaliseOptions(options.map((o) => ({ name: o.name, values: o.values }))), [options])
  React.useEffect(() => {
    let combos: Combination[]
    try {
      combos = combinations(normalised)
    } catch {
      return
    }
    setRows((prev) => {
      const byKey = new Map(prev.map((r) => [combinationKey(r.options), r]))
      const single = prev.length === 1 && !prev[0].options.some(Boolean) ? prev[0] : null
      return combos.map((c) => byKey.get(combinationKey(c)) ?? (combos.length === 1 && single ? { ...single, options: c } : { ...emptyRow(c), price: single?.price ?? "", cost: single?.cost ?? "" }))
    })
  }, [normalised])

  const activeLocations = ctx.locations.filter((l) => l.active)
  const multi = normalised.length > 0
  const setRow = (key: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (combinationKey(r.options) === key ? { ...r, ...patch } : r)))
    onDirty()
  }

  handle.current = {
    check: () => {
      if (loading) return "Wait for the stock and shipping details to load."
      for (const o of options) {
        if (o.name.trim() && o.values.length === 0 && !o.draft.trim()) return `Add a value to ${o.name.trim()}`
        if (!o.name.trim() && (o.values.length || o.draft.trim())) return "Name every option, like Size or Color"
      }
      if (rows.length > 250) return "Up to 250 variants. Remove some option values."
      const base = centsOf(basePrice)
      for (const r of rows) {
        if (!r.active) continue
        const p = centsOf(r.price) ?? base
        if (p === null || p < 50) return multi ? `Set a price for ${variantName(r.options)}` : "Set a price of at least $0.50"
      }
      return null
    },
    save: async (id: string) => {
      /* A value still in the box counts as added. */
      const opts = options.map((o) => ({ name: o.name, values: o.draft.trim() ? [...o.values, o.draft.trim()] : o.values }))
      const variants = rows.map((r) => {
        const stock: Record<string, number> = {}
        if (trackInventory) {
          for (const [loc, typed] of Object.entries(r.stock)) {
            const n = Number.parseInt(typed, 10)
            if (Number.isFinite(n) && (r.loadedOnHand[loc] === undefined || r.loadedOnHand[loc] !== n)) stock[loc] = n
          }
        }
        return {
          id: r.id,
          options: r.options,
          priceCents: centsOf(r.price) ?? centsOf(basePrice),
          compareAtCents: centsOf(r.compareAt),
          costCents: centsOf(r.cost),
          sku: r.sku.trim() || null,
          barcode: r.barcode.trim() || null,
          weightGrams: r.weight.trim() ? toGrams(r.weight, weightUnit) : null,
          active: r.active,
          stock,
        }
      })
      const res = await api<{ product: ProductData }>(`/api/physical/products/${id}`, {
        method: "PUT",
        body: {
          vendor: vendor.trim() || null,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          requiresShipping,
          weightGrams: weight.trim() ? toGrams(weight, weightUnit) : null,
          weightUnit,
          dimensionUnit: dimUnit,
          lengthMm: dims.l ? toMm(dims.l, dimUnit) : null,
          widthMm: dims.w ? toMm(dims.w, dimUnit) : null,
          heightMm: dims.h ? toMm(dims.h, dimUnit) : null,
          originCountry: origin || null,
          hsCode: hsCode.trim() || null,
          trackInventory,
          continueSelling,
          lowStockThreshold: lowStock.trim() ? Number(lowStock) : null,
          fulfillmentLocationId: shipsFrom || null,
          shippingProfileId: profileId || null,
          options: opts,
          variants,
        },
      })
      if (!res.ok) return res.error
      apply(res.data.product)
      return null
    },
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        {[0, 1].map((i) => (
          <div key={i} className="h-[180px] animate-pulse rounded-2xl border border-[#e5e7eb]/60 bg-white" />
        ))}
      </div>
    )
  }
  if (loadError) return <Notice>{loadError}</Notice>

  const single = rows[0]
  const singleKey = single ? combinationKey(single.options) : ""
  const marginOf = (r: Row) => {
    const m = marginPercent(centsOf(r.price) ?? centsOf(basePrice) ?? 0, centsOf(r.cost))
    return m === null ? "" : `${m}%`
  }

  return (
    <div className="space-y-4 sm:space-y-5" data-physical-cards="">
      {/* ── Variants ─────────────────────────────────────────────────── */}
      <Card
        id="physical-variants"
        title="Variants"
        description={multi ? `${rows.length} ${rows.length === 1 ? "variant" : "variants"} from your options` : "Sizes, colors or materials, each with its own price and stock."}
      >
        <div className="space-y-3">
          {options.map((o, i) => (
            <div key={i} className="rounded-xl border border-[#eceef1] p-3">
              <div className="flex items-center gap-2">
                <TextInput
                  aria-label="Option name"
                  placeholder={i === 0 ? "Size" : i === 1 ? "Color" : "Material"}
                  value={o.name}
                  onChange={(e) => changed(setOptions)((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value.slice(0, 40) } : x)))}
                  className="flex-1"
                />
                <button type="button" aria-label="Remove option" onClick={() => changed(setOptions)((prev) => prev.filter((_, j) => j !== i))} className={cn(BTN_GHOST, "h-10 w-10 shrink-0 px-0")}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {o.values.map((v, k) => (
                  <span key={`${v}-${k}`} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#f1f2f4] pl-2.5 pr-1 text-[13px] font-medium text-[#374151]">
                    {v}
                    <button type="button" aria-label={`Remove ${v}`} onClick={() => changed(setOptions)((prev) => prev.map((x, j) => (j === i ? { ...x, values: x.values.filter((_, n) => n !== k) } : x)))} className="grid h-6 w-6 place-items-center rounded-md hover:bg-[#e2e3e7]">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  aria-label={`Add a value to ${o.name || "this option"}`}
                  placeholder={o.values.length ? "Add another value" : "Add values, press Enter after each"}
                  value={o.draft}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v.endsWith(",")) {
                      const add = v.slice(0, -1).trim()
                      changed(setOptions)((prev) => prev.map((x, j) => (j === i ? { ...x, draft: "", values: add && !x.values.some((y) => y.toLowerCase() === add.toLowerCase()) ? [...x.values, add.slice(0, 100)] : x.values } : x)))
                    } else setOptions((prev) => prev.map((x, j) => (j === i ? { ...x, draft: v } : x)))
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return
                    e.preventDefault()
                    const add = o.draft.trim()
                    if (!add) return
                    changed(setOptions)((prev) => prev.map((x, j) => (j === i ? { ...x, draft: "", values: x.values.some((y) => y.toLowerCase() === add.toLowerCase()) ? x.values : [...x.values, add.slice(0, 100)] } : x)))
                  }}
                  onBlur={() => {
                    const add = o.draft.trim()
                    if (!add) return
                    changed(setOptions)((prev) => prev.map((x, j) => (j === i ? { ...x, draft: "", values: x.values.some((y) => y.toLowerCase() === add.toLowerCase()) ? x.values : [...x.values, add.slice(0, 100)] } : x)))
                  }}
                  className="h-8 min-w-[160px] flex-1 rounded-lg border-0 bg-transparent px-1 text-[14px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af]"
                />
              </div>
            </div>
          ))}
          {options.length < 3 ? (
            <button type="button" onClick={() => changed(setOptions)((prev) => [...prev, { name: "", values: [], draft: "" }])} className={BTN_SECONDARY}>
              <Plus className="h-4 w-4" />
              {options.length === 0 ? "Add options like size or color" : "Add another option"}
            </button>
          ) : null}
        </div>

        {multi ? (
          <div className="mt-5">
            {trackInventory && activeLocations.length > 1 ? (
              <div className="mb-3 flex items-center justify-end gap-2">
                <span className="text-[13px] text-[#6b7280]">Stock at</span>
                <SelectInput value={stockAt} onChange={setStockAt} className="w-[200px]" aria-label="Location for the stock column">
                  {activeLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </SelectInput>
              </div>
            ) : null}
            <div className="overflow-hidden rounded-xl border border-[#eceef1]">
              <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_36px] gap-3 border-b border-[#eceef1] bg-[#f8f9fa] px-3 py-2 text-[12px] font-medium uppercase tracking-[0.02em] text-[#6b7280] md:grid">
                <span>Variant</span>
                <span>Price</span>
                <span>Cost</span>
                <span>SKU</span>
                <span>{trackInventory ? "On hand" : "Stock"}</span>
                <span />
              </div>
              {rows.map((r) => {
                const key = combinationKey(r.options)
                const open = openRow === key
                const committed = stockAt ? r.committed[stockAt] ?? 0 : 0
                return (
                  <div key={key} className={cn("border-b border-[#eceef1] last:border-b-0", !r.active && "bg-[#fafafa]")}>
                    <div className="grid grid-cols-2 gap-2 px-3 py-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_36px] md:items-center md:gap-3">
                      <div className="col-span-2 flex min-w-0 items-center gap-2 md:col-span-1">
                        <span className={cn("truncate text-[14px] font-medium", r.active ? "text-[#1a1a2e]" : "text-[#9ca3af] line-through")}>{variantName(r.options)}</span>
                      </div>
                      <label className="md:contents">
                        <span className="mb-1 block text-[12px] text-[#6b7280] md:hidden">Price</span>
                        <MoneyInput aria-label={`Price for ${variantName(r.options)}`} value={r.price} placeholder={basePrice || "0.00"} onChange={(v) => setRow(key, { price: v })} />
                      </label>
                      <label className="md:contents">
                        <span className="mb-1 block text-[12px] text-[#6b7280] md:hidden">Cost</span>
                        <MoneyInput aria-label={`Cost for ${variantName(r.options)}`} value={r.cost} onChange={(v) => setRow(key, { cost: v })} />
                      </label>
                      <label className="md:contents">
                        <span className="mb-1 block text-[12px] text-[#6b7280] md:hidden">SKU</span>
                        <TextInput aria-label={`SKU for ${variantName(r.options)}`} value={r.sku} maxLength={64} onChange={(e) => setRow(key, { sku: e.target.value })} />
                      </label>
                      <label className="md:contents">
                        <span className="mb-1 block text-[12px] text-[#6b7280] md:hidden">{trackInventory ? "On hand" : "Stock"}</span>
                        {trackInventory && stockAt ? (
                          <div>
                            <NumberInput allowNegative aria-label={`On hand for ${variantName(r.options)}`} value={r.stock[stockAt] ?? ""} placeholder="0" onChange={(v) => setRow(key, { stock: { ...r.stock, [stockAt]: v } })} />
                            {committed > 0 ? <span className="mt-0.5 block text-[11.5px] text-[#6b7280]">{committed} in orders</span> : null}
                          </div>
                        ) : (
                          <span className="text-[13px] text-[#6b7280]">Not tracked</span>
                        )}
                      </label>
                      <button type="button" aria-expanded={open} aria-label={`More for ${variantName(r.options)}`} onClick={() => setOpenRow(open ? null : key)} className={cn(BTN_GHOST, "col-span-2 h-9 justify-start px-0 md:col-span-1 md:w-9 md:justify-center")}>
                        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
                        <span className="md:sr-only">More details</span>
                      </button>
                    </div>
                    {open ? (
                      <div className="grid gap-3 border-t border-dashed border-[#eceef1] bg-[#fcfcfd] px-3 py-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="Compare-at price">
                          <MoneyInput value={r.compareAt} onChange={(v) => setRow(key, { compareAt: v })} />
                        </Field>
                        <Field label="Barcode" hint="ISBN, UPC, GTIN">
                          <TextInput value={r.barcode} maxLength={64} onChange={(e) => setRow(key, { barcode: e.target.value })} />
                        </Field>
                        <Field label="Weight" hint="Blank uses the product's">
                          <DecimalInput value={r.weight} onChange={(v) => setRow(key, { weight: v })} suffix={weightUnit} />
                        </Field>
                        <div className="flex flex-col justify-end gap-1.5 pb-1">
                          <Toggle label="On sale" description={marginOf(r) ? `Margin ${marginOf(r)}` : undefined} checked={r.active} onChange={(v) => setRow(key, { active: v })} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </Card>

      {/* ── Inventory ────────────────────────────────────────────────── */}
      <Card id="physical-inventory" title="Inventory" description="How many you have and where.">
        <div className="space-y-4">
          <Toggle label="Track quantity" description="Stock goes down when an order ships and is held while a buyer pays." checked={trackInventory} onChange={changed(setTrackInventory)} />
          {trackInventory && !multi && single ? (
            <div className="space-y-2">
              {activeLocations.length === 0 ? (
                <Notice tone="amber">
                  Add a location to keep stock at. <Link href="/app/settings?tab=shipping&section=locations" className="font-medium underline underline-offset-2">Locations</Link>
                </Notice>
              ) : (
                activeLocations.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#eceef1] px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{l.name}</p>
                      {(single.committed[l.id] ?? 0) > 0 ? <p className="text-[12px] text-[#6b7280]">{single.committed[l.id]} in unshipped orders</p> : <p className="text-[12px] text-[#6b7280]">On hand</p>}
                    </div>
                    <NumberInput allowNegative aria-label={`On hand at ${l.name}`} placeholder="0" value={single.stock[l.id] ?? ""} onChange={(v) => setRow(singleKey, { stock: { ...single.stock, [l.id]: v } })} className="w-[110px] text-right" />
                  </div>
                ))
              )}
            </div>
          ) : null}
          {trackInventory ? <Toggle label="Keep selling when out of stock" description="Buyers can order and you ship when it's back." checked={continueSelling} onChange={changed(setContinueSelling)} /> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {!multi && single ? (
              <>
                <Field label="SKU" hint="Your own code for this item">
                  <TextInput value={single.sku} maxLength={64} onChange={(e) => setRow(singleKey, { sku: e.target.value })} />
                </Field>
                <Field label="Barcode" hint="ISBN, UPC, GTIN">
                  <TextInput value={single.barcode} maxLength={64} onChange={(e) => setRow(singleKey, { barcode: e.target.value })} />
                </Field>
                <Field label="Cost per item" hint={marginOf(single) ? `Margin ${marginOf(single)}. Buyers never see this.` : "Buyers never see this."}>
                  <MoneyInput value={single.cost} onChange={(v) => setRow(singleKey, { cost: v })} />
                </Field>
              </>
            ) : null}
            {trackInventory ? (
              <Field label="Low stock alert" hint="Shown on Inventory at or below this">
                <NumberInput value={lowStock} placeholder="5" onChange={changed(setLowStock)} />
              </Field>
            ) : null}
          </div>
        </div>
      </Card>

      {/* ── Shipping ─────────────────────────────────────────────────── */}
      <Card id="physical-shipping" title="Shipping" description="What delivery is priced from.">
        <div className="space-y-4">
          <Toggle label="This product is shipped" description="Off for things handed over in person or not sent by post." checked={requiresShipping} onChange={changed(setRequiresShipping)} />
          {requiresShipping ? (
            <>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                <Field label="Weight" hint="With its packaging">
                  <DecimalInput value={weight} onChange={changed(setWeight)} placeholder="0.0" />
                </Field>
                <Field label="Unit">
                  <SelectInput value={weightUnit} onChange={(v) => changed(setWeightUnit)(v as WeightUnit)}>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="lb">lb</option>
                    <option value="oz">oz</option>
                  </SelectInput>
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-[1fr_1fr_1fr_100px] sm:gap-3">
                <Field label="Length">
                  <DecimalInput value={dims.l} onChange={(v) => changed(setDims)((d) => ({ ...d, l: v }))} />
                </Field>
                <Field label="Width">
                  <DecimalInput value={dims.w} onChange={(v) => changed(setDims)((d) => ({ ...d, w: v }))} />
                </Field>
                <Field label="Height">
                  <DecimalInput value={dims.h} onChange={(v) => changed(setDims)((d) => ({ ...d, h: v }))} />
                </Field>
                <Field label="Unit" className="col-span-3 sm:col-span-1">
                  <SelectInput value={dimUnit} onChange={(v) => changed(setDimUnit)(v as DimensionUnit)}>
                    <option value="cm">cm</option>
                    <option value="in">in</option>
                  </SelectInput>
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Ships from" hint="Any location picks the one with stock">
                  <SelectInput value={shipsFrom} onChange={changed(setShipsFrom)}>
                    <option value="">Any location with stock</option>
                    {activeLocations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Shipping profile" hint={<Link href="/app/settings?tab=shipping&section=rates" className="underline underline-offset-2">Manage rates</Link>}>
                  <SelectInput value={profileId} onChange={changed(setProfileId)}>
                    <option value="">{ctx.profiles.find((p) => p.isDefault)?.name ?? "General"} (default)</option>
                    {ctx.profiles
                      .filter((p) => !p.isDefault)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </SelectInput>
                </Field>
              </div>
              <div className="rounded-xl border border-[#eceef1]">
                <button type="button" aria-expanded={customsOpen} onClick={() => setCustomsOpen((v) => !v)} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[14px] font-medium text-[#1a1a2e]">
                  Customs information
                  <ChevronDown className={cn("h-4 w-4 text-[#6b7280] transition-transform", customsOpen && "rotate-180")} />
                </button>
                {customsOpen ? (
                  <div className="grid gap-3 border-t border-[#eceef1] px-3 py-3 sm:grid-cols-2">
                    <Field label="Country of origin">
                      <SelectInput value={origin} onChange={changed(setOrigin)}>
                        <option value="">Not set</option>
                        {COUNTRIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label="HS code" hint="For international customs forms">
                      <TextInput value={hsCode} inputMode="numeric" maxLength={14} onChange={(e) => changed(setHsCode)(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="6109.10" />
                    </Field>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </Card>

      {/* ── Organization ─────────────────────────────────────────────── */}
      <Card id="physical-organization" title="Organization" description="Used by collections and search.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vendor" hint="The brand or maker">
            <TextInput value={vendor} maxLength={120} onChange={(e) => changed(setVendor)(e.target.value)} />
          </Field>
          <Field label="Tags" hint="Separated by commas">
            <input value={tags} onChange={(e) => changed(setTags)(e.target.value)} className={FIELD} placeholder="summer, linen" />
          </Field>
        </div>
      </Card>
    </div>
  )
}
