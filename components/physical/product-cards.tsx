"use client"

/**
 * ===========================================================================
 *  A PHYSICAL PRODUCT IN THE PRODUCT EDITOR
 * ===========================================================================
 * Shown in place of Digital Files and the digital Variants card when the
 * product is physical (app/app/products/new/product-editor.tsx). The editor
 * saves the product row as it always has, then asks these cards to save
 * theirs through `handle.save(productId)` (PUT /api/physical/products/[id]),
 * so a new product gets its options, variants and stock in the same Save.
 *
 * Only what a seller needs is open; the rest waits under Advanced:
 *
 *   Inventory    track it or not; one quantity for a simple product, one per
 *                variant otherwise; keep selling when out; low stock alert
 *   Variants     up to three options (Size, Color, Material) and every
 *                combination as a row: image, price, quantity, optional SKU,
 *                and under "more" weight, compare at, cost, barcode, who
 *                fulfils it, on sale
 *   Shipping     shipped or not, weight in the shop's units, shipping profile
 *   Fulfillment  "How will this product be fulfilled?" four plain answers,
 *                and for a partner, which one (made here in two fields)
 *   Advanced     SKU and barcode, cost, size, customs, tax, vendor and tags
 *
 * Stock typed here is a count: the server records the difference as a
 * movement in the history (lib/physical/inventory-server.ts).
 */

import * as React from "react"
import Link from "next/link"
import { ChevronDown, ImagePlus, Plus, Trash2, Upload, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { COUNTRIES } from "@/lib/checkout/countries"
import { combinationKey, combinations, normaliseOptions, variantName, type Combination } from "@/lib/physical/variants"
import { dimensionUnitFor, fromGrams, fromMm, toGrams, toMm, weightUnitFor, type DimensionUnit, type UnitSystem, type WeightUnit } from "@/lib/physical/units"
import { marginPercent } from "@/lib/physical/totals"
import { METHODS, METHOD_ORDER } from "@/lib/physical/fulfillment"
import type { FulfillmentMethod, Location, PhysicalVariant, ProductOption } from "@/lib/physical/types"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, Card, DecimalInput, FIELD, Field, Modal, MoneyInput, Notice, NumberInput, SelectInput, TextInput, Toggle, api, centsOf, dollarsOf } from "./ui"

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
  imageUrl: string | null
  /** "" is "as the product". */
  method: FulfillmentMethod | ""
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

interface ShopSettings {
  unitSystem: UnitSystem
  taxMode: "none" | "manual" | "provider"
  lowStockDefault: number
  lowStockAlerts: boolean
}

interface Context {
  locations: Location[]
  profiles: { id: string; name: string; isDefault: boolean; zoneCount?: number }[]
  settings: ShopSettings
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
  taxCategory: string | null
  trackInventory: boolean
  continueSelling: boolean
  lowStockThreshold: number | null
  fulfillmentLocationId: string | null
  fulfillmentMethod: FulfillmentMethod
  shippingProfileId: string | null
  options: ProductOption[]
  variants: PhysicalVariant[]
  levels: { variantId: string; locationId: string; onHand: number; committed: number }[]
}

const DEFAULT_SETTINGS: ShopSettings = { unitSystem: "metric", taxMode: "none", lowStockDefault: 5, lowStockAlerts: true }

function emptyRow(options: Combination): Row {
  return { id: null, options, price: "", compareAt: "", cost: "", sku: "", barcode: "", weight: "", imageUrl: null, method: "", active: true, stock: {}, loadedOnHand: {}, committed: {} }
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
        imageUrl: v.imageUrl ?? null,
        method: v.fulfillmentMethod ?? "",
        active: v.active,
        stock: Object.fromEntries(levels.map((l) => [l.locationId, String(l.onHand)])),
        loadedOnHand: Object.fromEntries(levels.map((l) => [l.locationId, l.onHand])),
        committed: Object.fromEntries(levels.map((l) => [l.locationId, l.committed])),
      }
    })
}

export interface PhysicalCardsProps {
  productId: string | null
  basePrice: string
  handle: React.MutableRefObject<PhysicalEditorHandle | null>
  onDirty: () => void
  /** The product's own photos, offered as variant images. */
  images?: string[]
  /** Uploads a new picture for a variant; resolves to its https address. */
  uploadImage?: (file: File) => Promise<string>
}

export function PhysicalProductCards(props: PhysicalCardsProps) {
  const enabled = usePhysicalCommerceEnabled()
  if (!enabled) {
    /* Switched off in /admin: nothing physical is read or written, and nothing is lost. */
    props.handle.current = { check: () => null, save: async () => null }
    return <Notice tone="gray">Physical products are turned off on Storelib right now. This product's variants, stock and shipping are kept as they are and come back when it's on.</Notice>
  }
  return <Cards {...props} />
}

function Cards({ productId, basePrice, handle, onDirty, images = [], uploadImage }: PhysicalCardsProps) {
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [ctx, setCtx] = React.useState<Context>({ locations: [], profiles: [], settings: DEFAULT_SETTINGS })

  const [requiresShipping, setRequiresShipping] = React.useState(true)
  const [weight, setWeight] = React.useState("")
  const [weightUnit, setWeightUnit] = React.useState<WeightUnit>("kg")
  const [dims, setDims] = React.useState({ l: "", w: "", h: "" })
  const [dimUnit, setDimUnit] = React.useState<DimensionUnit>("cm")
  const [origin, setOrigin] = React.useState("")
  const [hsCode, setHsCode] = React.useState("")
  const [profileId, setProfileId] = React.useState("")
  const [shipsFrom, setShipsFrom] = React.useState("")
  const [method, setMethod] = React.useState<FulfillmentMethod>("self")
  const [trackInventory, setTrackInventory] = React.useState(true)
  const [continueSelling, setContinueSelling] = React.useState(false)
  const [lowStock, setLowStock] = React.useState("")
  const [taxable, setTaxable] = React.useState(true)
  const [taxCategory, setTaxCategory] = React.useState("")
  const [vendor, setVendor] = React.useState("")
  const [tags, setTags] = React.useState("")
  const [advancedOpen, setAdvancedOpen] = React.useState(false)

  const [options, setOptions] = React.useState<OptionDraft[]>([])
  const [rows, setRows] = React.useState<Row[]>([emptyRow([null, null, null])])
  const [stockAt, setStockAt] = React.useState("")
  const [openRow, setOpenRow] = React.useState<string | null>(null)
  const [imageFor, setImageFor] = React.useState<string | null>(null)

  const apply = React.useCallback((p: ProductData) => {
    setRequiresShipping(p.requiresShipping)
    setWeightUnit(p.weightUnit)
    setWeight(p.weightGrams === null ? "" : String(fromGrams(p.weightGrams, p.weightUnit) ?? ""))
    setDimUnit(p.dimensionUnit)
    setDims({ l: p.lengthMm ? String(fromMm(p.lengthMm, p.dimensionUnit)) : "", w: p.widthMm ? String(fromMm(p.widthMm, p.dimensionUnit)) : "", h: p.heightMm ? String(fromMm(p.heightMm, p.dimensionUnit)) : "" })
    setOrigin(p.originCountry ?? "")
    setHsCode(p.hsCode ?? "")
    setProfileId(p.shippingProfileId ?? "")
    setShipsFrom(p.fulfillmentLocationId ?? "")
    setMethod(p.fulfillmentMethod ?? "self")
    setTrackInventory(p.trackInventory)
    setContinueSelling(p.continueSelling)
    setLowStock(p.lowStockThreshold === null ? "" : String(p.lowStockThreshold))
    setTaxable(p.taxable)
    setTaxCategory(p.taxCategory ?? "")
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
      const settings = { ...DEFAULT_SETTINGS, ...(context.data.settings ?? {}) }
      setCtx({ ...context.data, settings })
      setStockAt(context.data.locations.find((l) => l.active)?.id ?? "")
      if (productId) {
        const got = await api<{ product: ProductData }>(`/api/physical/products/${productId}`)
        if (gone) return
        if (got.ok) apply(got.data.product)
        else setLoadError(got.error)
      } else {
        /* A new product is typed in the shop's own units. */
        setWeightUnit(weightUnitFor(settings.unitSystem))
        setDimUnit(dimensionUnitFor(settings.unitSystem))
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

  /* Where it ships from: any of the seller's own places for "myself", a partner of the right kind otherwise. */
  const partners = activeLocations.filter((l) => METHODS[method].locationKinds.includes(l.kind))
  const pickMethod = (m: FulfillmentMethod) => {
    changed(setMethod)(m)
    const here = ctx.locations.find((l) => l.id === shipsFrom)
    if (here && !METHODS[m].locationKinds.includes(here.kind)) setShipsFrom("")
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
      if (requiresShipping && weight.trim() && toGrams(weight, weightUnit) === null) return "Check the weight"
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
          imageUrl: r.imageUrl,
          fulfillmentMethod: r.method || null,
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
          taxable,
          taxCategory: taxCategory.trim() || null,
          trackInventory,
          continueSelling,
          lowStockThreshold: lowStock.trim() ? Number(lowStock) : null,
          fulfillmentMethod: method,
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
      <div className="space-y-4" aria-busy="true" aria-label="Loading stock and shipping">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[150px] animate-pulse rounded-2xl border border-[#e5e7eb]/60 bg-white" />
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
  const onlyLocation = activeLocations.length === 1 ? activeLocations[0] : null
  const lowDefault = ctx.settings.lowStockDefault
  const imageRow = imageFor ? rows.find((r) => combinationKey(r.options) === imageFor) ?? null : null

  return (
    <div className="space-y-4 sm:space-y-5" data-physical-cards="">
      {/* ── Inventory ────────────────────────────────────────────────── */}
      <Card id="physical-inventory" title="Inventory" description={trackInventory ? "Stock goes down with every sale. Nobody can buy more than you have." : "Not counted: it can always be bought."}>
        <div className="space-y-4">
          <Toggle label="Track inventory" description="Count how many you have and stop selling at zero." checked={trackInventory} onChange={changed(setTrackInventory)} />
          {trackInventory && !multi && single ? (
            activeLocations.length === 0 ? (
              <Notice tone="amber">
                Add the place you keep stock first.{" "}
                <Link href="/app/settings?tab=shipping&section=locations" className="font-medium underline underline-offset-2">
                  Add a location
                </Link>
              </Notice>
            ) : onlyLocation ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Quantity" hint={(single.committed[onlyLocation.id] ?? 0) > 0 ? `${single.committed[onlyLocation.id]} held for unshipped orders` : "How many you have right now"}>
                  <NumberInput allowNegative aria-label="Quantity" placeholder="0" value={single.stock[onlyLocation.id] ?? ""} onChange={(v) => setRow(singleKey, { stock: { ...single.stock, [onlyLocation.id]: v } })} />
                </Field>
                <Field label="Low stock alert" hint={ctx.settings.lowStockAlerts ? "We email you when it drops to this" : "Marked Low on Inventory at this"}>
                  <NumberInput value={lowStock} placeholder={String(lowDefault)} onChange={changed(setLowStock)} />
                </Field>
              </div>
            ) : (
              <div className="space-y-2">
                {activeLocations.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#eceef1] px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{l.name}</p>
                      <p className="text-[12px] text-[#6b7280]">{(single.committed[l.id] ?? 0) > 0 ? `${single.committed[l.id]} held for unshipped orders` : "Quantity"}</p>
                    </div>
                    <NumberInput allowNegative aria-label={`Quantity at ${l.name}`} placeholder="0" value={single.stock[l.id] ?? ""} onChange={(v) => setRow(singleKey, { stock: { ...single.stock, [l.id]: v } })} className="w-[110px] text-right" />
                  </div>
                ))}
              </div>
            )
          ) : null}
          {trackInventory && multi ? <p className="text-[13px] text-[#6b7280]">Each variant has its own quantity, in the Variants table below.</p> : null}
          {trackInventory && (multi || !onlyLocation) ? (
            <Field label="Low stock alert" hint={ctx.settings.lowStockAlerts ? "We email you when a variant drops to this" : "Marked Low on Inventory at this"} className="sm:max-w-[260px]">
              <NumberInput value={lowStock} placeholder={String(lowDefault)} onChange={changed(setLowStock)} />
            </Field>
          ) : null}
          {trackInventory ? <Toggle label="Keep selling when out of stock" description="Buyers can still order, and you ship when it's back." checked={continueSelling} onChange={changed(setContinueSelling)} /> : null}
        </div>
      </Card>

      {/* ── Variants ─────────────────────────────────────────────────── */}
      <Card
        id="physical-variants"
        title="Variants"
        description={multi ? `${rows.length} ${rows.length === 1 ? "variant" : "variants"}, made from your options` : "Sizes, colors or materials. Each one gets its own price, quantity and photo."}
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
                  placeholder={o.values.length ? "Add another" : "Type a value, press Enter"}
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
                  className="h-8 min-w-[150px] flex-1 rounded-lg border-0 bg-transparent px-1 text-[14px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af]"
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
                <span className="text-[13px] text-[#6b7280]">Quantity at</span>
                <SelectInput value={stockAt} onChange={setStockAt} className="w-[200px]" aria-label="Location for the quantity column">
                  {activeLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </SelectInput>
              </div>
            ) : null}
            <div className="overflow-hidden rounded-xl border border-[#eceef1]">
              <div className="hidden grid-cols-[44px_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_36px] gap-3 border-b border-[#eceef1] bg-[#f8f9fa] px-3 py-2 text-[12px] font-medium uppercase tracking-[0.02em] text-[#6b7280] md:grid">
                <span />
                <span>Variant</span>
                <span>Price</span>
                <span>Quantity</span>
                <span>SKU (optional)</span>
                <span />
              </div>
              {rows.map((r) => {
                const key = combinationKey(r.options)
                const open = openRow === key
                const committed = stockAt ? r.committed[stockAt] ?? 0 : 0
                const name = variantName(r.options)
                return (
                  <div key={key} className={cn("border-b border-[#eceef1] last:border-b-0", !r.active && "bg-[#fafafa]")} data-variant-row="">
                    <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-3 gap-y-2 px-3 py-3 md:grid-cols-[44px_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_36px] md:items-center">
                      <button
                        type="button"
                        onClick={() => setImageFor(key)}
                        aria-label={r.imageUrl ? `Change the photo for ${name}` : `Add a photo for ${name}`}
                        className="row-span-2 grid h-11 w-11 place-items-center overflow-hidden rounded-lg border border-dashed border-[#d1d5db] bg-[#fafafa] text-[#9ca3af] transition-colors hover:border-[#9ca3af] hover:text-[#4b5563] md:row-span-1"
                      >
                        {r.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImagePlus className="h-4 w-4" />
                        )}
                      </button>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={cn("truncate text-[14px] font-medium", r.active ? "text-[#1a1a2e]" : "text-[#9ca3af] line-through")}>{name}</span>
                      </div>
                      <div className="col-start-2 grid grid-cols-3 gap-2 md:contents">
                        <label className="md:contents">
                          <span className="mb-1 block text-[12px] text-[#6b7280] md:hidden">Price</span>
                          <MoneyInput aria-label={`Price for ${name}`} value={r.price} placeholder={basePrice || "0.00"} onChange={(v) => setRow(key, { price: v })} />
                        </label>
                        <label className="md:contents">
                          <span className="mb-1 block text-[12px] text-[#6b7280] md:hidden">Quantity</span>
                          {trackInventory && stockAt ? (
                            <div>
                              <NumberInput allowNegative aria-label={`Quantity for ${name}`} value={r.stock[stockAt] ?? ""} placeholder="0" onChange={(v) => setRow(key, { stock: { ...r.stock, [stockAt]: v } })} />
                              {committed > 0 ? <span className="mt-0.5 block text-[11.5px] text-[#6b7280]">{committed} held</span> : null}
                            </div>
                          ) : (
                            <span className="flex h-10 items-center text-[13px] text-[#6b7280]">Not tracked</span>
                          )}
                        </label>
                        <label className="md:contents">
                          <span className="mb-1 block text-[12px] text-[#6b7280] md:hidden">SKU</span>
                          <TextInput aria-label={`SKU for ${name}`} value={r.sku} maxLength={64} placeholder="Optional" onChange={(e) => setRow(key, { sku: e.target.value })} />
                        </label>
                      </div>
                      <button type="button" aria-expanded={open} aria-label={`More for ${name}`} onClick={() => setOpenRow(open ? null : key)} className={cn(BTN_GHOST, "col-start-2 h-8 justify-start px-0 md:col-start-auto md:w-9 md:justify-center")}>
                        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
                        <span className="md:sr-only">Weight, cost and more</span>
                      </button>
                    </div>
                    {open ? (
                      <div className="grid gap-3 border-t border-dashed border-[#eceef1] bg-[#fcfcfd] px-3 py-3 sm:grid-cols-2 lg:grid-cols-3">
                        <Field label="Weight" hint="Empty uses the product's">
                          <DecimalInput value={r.weight} onChange={(v) => setRow(key, { weight: v })} suffix={weightUnit} />
                        </Field>
                        <Field label="Compare-at price" hint="Shown crossed out">
                          <MoneyInput value={r.compareAt} placeholder="" onChange={(v) => setRow(key, { compareAt: v })} />
                        </Field>
                        <Field label="Cost per item" hint={marginOf(r) ? `Margin ${marginOf(r)}. Buyers never see this.` : "Buyers never see this."}>
                          <MoneyInput value={r.cost} placeholder="" onChange={(v) => setRow(key, { cost: v })} />
                        </Field>
                        <Field label="Barcode" hint="ISBN, UPC, GTIN">
                          <TextInput value={r.barcode} maxLength={64} onChange={(e) => setRow(key, { barcode: e.target.value })} />
                        </Field>
                        <Field label="Fulfilled by">
                          <SelectInput value={r.method} onChange={(v) => setRow(key, { method: v as FulfillmentMethod | "" })}>
                            <option value="">Same as the product</option>
                            {METHOD_ORDER.map((m) => (
                              <option key={m} value={m}>
                                {METHODS[m].title}
                              </option>
                            ))}
                          </SelectInput>
                        </Field>
                        <div className="flex flex-col justify-end pb-1">
                          <Toggle label="On sale" description="Off hides it from buyers" checked={r.active} onChange={(v) => setRow(key, { active: v })} />
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

      {/* ── Shipping ─────────────────────────────────────────────────── */}
      <Card id="physical-shipping" title="Shipping" description={requiresShipping ? "Used to work out delivery at checkout." : "Not shipped: handed over in person, or nothing to send."}>
        <div className="space-y-4">
          <Toggle label="This product is shipped" description="Off for things you hand over yourself." checked={requiresShipping} onChange={changed(setRequiresShipping)} />
          {requiresShipping ? (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px_minmax(0,1.3fr)]">
              <Field label="Weight" hint="With its packaging">
                <DecimalInput value={weight} onChange={changed(setWeight)} placeholder="0.0" aria-label="Weight" />
              </Field>
              <Field label="Unit">
                <SelectInput value={weightUnit} onChange={(v) => changed(setWeightUnit)(v as WeightUnit)} aria-label="Weight unit">
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="lb">lb</option>
                  <option value="oz">oz</option>
                </SelectInput>
              </Field>
              <Field
                label="Shipping profile"
                hint={
                  <Link href="/app/settings?tab=shipping&section=delivery" className="underline underline-offset-2">
                    Edit shipping rates
                  </Link>
                }
              >
                <SelectInput value={profileId} onChange={changed(setProfileId)} aria-label="Shipping profile">
                  <option value="">{ctx.profiles.find((p) => p.isDefault)?.name ?? "General"} (all products)</option>
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
          ) : null}
          {requiresShipping && ctx.profiles.every((p) => (p.zoneCount ?? 0) === 0) ? (
            <Notice tone="amber">
              You haven't set where you ship yet, so buyers can't check out.{" "}
              <Link href="/app/settings?tab=shipping&section=delivery" className="font-medium underline underline-offset-2">
                Set up shipping
              </Link>
            </Notice>
          ) : null}
        </div>
      </Card>

      {/* ── Fulfillment ──────────────────────────────────────────────── */}
      <Card
        id="physical-fulfillment"
        title="Fulfillment"
        description="How will this product be fulfilled?"
        action={
          <a href="/help/physical-products/fulfillment-methods" target="_blank" rel="noreferrer" className="text-[13px] font-medium text-[#6b7280] underline underline-offset-2 hover:text-[#1a1a2e]">
            How this works
          </a>
        }
      >
        <div className="space-y-4">
          <div role="radiogroup" aria-label="How will this product be fulfilled?" className="grid gap-2 sm:grid-cols-2">
            {METHOD_ORDER.map((m) => {
              const on = method === m
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pickMethod(m)}
                  className={cn("flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors", on ? "border-[#1a1a2e] bg-[#fafafa] shadow-[0_0_0_1px_#1a1a2e]" : "border-[#e5e7eb] hover:bg-[#f8f9fa]")}
                >
                  <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border", on ? "border-[#1a1a2e] bg-[#1a1a2e]" : "border-[#d1d5db]")}>{on ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}</span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium text-[#1a1a2e]">{METHODS[m].title}</span>
                    <span className="block text-[13px] leading-[18px] text-[#6b7280]">{METHODS[m].line}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {method === "self" ? (
            activeLocations.length > 1 ? (
              <Field label="Ships from" hint="Any picks the place with stock" className="sm:max-w-[360px]">
                <SelectInput value={shipsFrom} onChange={changed(setShipsFrom)}>
                  <option value="">Any of my locations</option>
                  {partners.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            ) : null
          ) : (
            <PartnerPicker
              method={method}
              partners={partners}
              value={shipsFrom}
              onChange={changed(setShipsFrom)}
              onCreated={(loc) => {
                setCtx((c) => ({ ...c, locations: [...c.locations, loc] }))
                changed(setShipsFrom)(loc.id)
              }}
            />
          )}
          <p className="rounded-xl bg-[#f7f7f8] px-3.5 py-2.5 text-[13px] leading-5 text-[#4b5563]">
            <span className="font-medium text-[#1a1a2e]">After a sale: </span>
            {METHODS[method].afterSale}
          </p>
        </div>
      </Card>

      {/* ── Advanced ─────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" id="physical-advanced">
        <button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left sm:px-6">
          <span>
            <span className="block text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]">Advanced</span>
            <span className="block text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">SKU, barcode, cost, size, customs, tax and tags</span>
          </span>
          <ChevronDown className={cn("h-5 w-5 shrink-0 text-[#6b7280] transition-transform", advancedOpen && "rotate-180")} />
        </button>
        {advancedOpen ? (
          <div className="space-y-5 border-t border-[#eceef1] px-4 py-4 sm:px-6 sm:py-5">
            {!multi && single ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="SKU" hint="Optional. Storelib keeps its own IDs.">
                  <TextInput value={single.sku} maxLength={64} onChange={(e) => setRow(singleKey, { sku: e.target.value })} />
                </Field>
                <Field label="Barcode" hint="ISBN, UPC, GTIN">
                  <TextInput value={single.barcode} maxLength={64} onChange={(e) => setRow(singleKey, { barcode: e.target.value })} />
                </Field>
                <Field label="Cost per item" hint={marginOf(single) ? `Margin ${marginOf(single)}. Buyers never see this.` : "Buyers never see this."}>
                  <MoneyInput value={single.cost} placeholder="" onChange={(v) => setRow(singleKey, { cost: v })} />
                </Field>
              </div>
            ) : null}
            {requiresShipping ? (
              <div>
                <p className="mb-2 text-[13.5px] font-medium text-[#374151]">Package size</p>
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
              </div>
            ) : null}
            {requiresShipping ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Country of origin" hint="For customs forms">
                  <SelectInput value={origin} onChange={changed(setOrigin)}>
                    <option value="">Not set</option>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="HS code" hint="For international customs">
                  <TextInput value={hsCode} inputMode="numeric" maxLength={14} onChange={(e) => changed(setHsCode)(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="6109.10" />
                </Field>
              </div>
            ) : null}
            <div className="space-y-3">
              <Toggle
                label="Charge tax on this product"
                description={
                  ctx.settings.taxMode === "manual" ? (
                    "Your tax rates apply at checkout."
                  ) : (
                    <>
                      Your shop doesn't charge tax yet.{" "}
                      <Link href="/app/settings?tab=shipping&section=taxes" className="underline underline-offset-2">
                        Set up tax
                      </Link>
                    </>
                  )
                }
                checked={taxable}
                onChange={changed(setTaxable)}
              />
              {taxable ? (
                <Field label="Tax category" hint="Optional, for your records and your accountant" className="sm:max-w-[360px]">
                  <TextInput value={taxCategory} maxLength={60} onChange={(e) => changed(setTaxCategory)(e.target.value)} placeholder="Clothing" />
                </Field>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Brand or maker" hint="Used by collections and search">
                <TextInput value={vendor} maxLength={120} onChange={(e) => changed(setVendor)(e.target.value)} />
              </Field>
              <Field label="Tags" hint="Separated by commas">
                <input value={tags} onChange={(e) => changed(setTags)(e.target.value)} className={FIELD} placeholder="summer, linen" />
              </Field>
            </div>
          </div>
        ) : null}
      </section>

      <VariantImagePicker
        open={!!imageRow}
        name={imageRow ? variantName(imageRow.options) : ""}
        value={imageRow?.imageUrl ?? null}
        images={images}
        uploadImage={uploadImage}
        onClose={() => setImageFor(null)}
        onPick={(url) => {
          if (imageFor) setRow(imageFor, { imageUrl: url })
          setImageFor(null)
        }}
      />
    </div>
  )
}

/** A partner for warehouse, dropshipping or print on demand: chosen, or made here in two fields. */
function PartnerPicker({ method, partners, value, onChange, onCreated }: { method: Exclude<FulfillmentMethod, "self">; partners: Location[]; value: string; onChange: (id: string) => void; onCreated: (l: Location) => void }) {
  const [adding, setAdding] = React.useState(partners.length === 0)
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const kind = METHODS[method].locationKinds[0]
  const label = method === "warehouse" ? "Warehouse" : method === "dropship" ? "Supplier" : "Print partner"
  const chosen = partners.find((p) => p.id === value) ?? null

  if (adding) {
    return (
      <div className="space-y-3 rounded-xl border border-[#eceef1] bg-[#fcfcfd] p-3" data-partner-form="">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`${label} name`}>
            <TextInput value={name} maxLength={80} placeholder={method === "print_on_demand" ? "My print shop" : method === "dropship" ? "My supplier" : "My warehouse"} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email orders to" hint="Optional. Each paid order is emailed here with the address.">
            <TextInput value={email} maxLength={254} inputMode="email" placeholder="orders@example.com" onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        {error ? <Notice>{error}</Notice> : null}
        <div className="flex justify-end gap-2">
          {partners.length > 0 ? (
            <button type="button" className={BTN_SECONDARY} onClick={() => setAdding(false)}>
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true)
              setError(null)
              const r = await api<{ location: Location }>("/api/physical/locations", {
                body: { name, kind, email: email.trim() || null, forwarding: email.trim() ? "email" : "none", holdsInventory: method === "warehouse", fulfillsOrders: true },
              })
              setBusy(false)
              if (!r.ok) return setError(r.error)
              onCreated(r.data.location)
              setAdding(false)
            }}
          >
            {busy ? "Adding" : `Add ${label.toLowerCase()}`}
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label={label} className="flex-1">
          <SelectInput value={value} onChange={onChange}>
            <option value="">Choose</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <button type="button" className={BTN_SECONDARY} onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          New
        </button>
      </div>
      {chosen ? (
        <p className="text-[12.5px] text-[#6b7280]">
          {chosen.forwarding === "email" && chosen.email ? `Orders are emailed to ${chosen.email}.` : chosen.forwarding === "webhook" ? "Orders are sent to your webhook." : "Orders aren't sent automatically. You pass them on."}{" "}
          <Link href="/app/settings?tab=shipping&section=locations" className="underline underline-offset-2">
            Change
          </Link>
        </p>
      ) : (
        <p className="text-[12.5px] text-[#b45309]">Choose who fulfils it, so orders reach them.</p>
      )}
    </div>
  )
}

function VariantImagePicker({
  open,
  name,
  value,
  images,
  uploadImage,
  onClose,
  onPick,
}: {
  open: boolean
  name: string
  value: string | null
  images: string[]
  uploadImage?: (file: File) => Promise<string>
  onClose: () => void
  onPick: (url: string | null) => void
}) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const input = React.useRef<HTMLInputElement>(null)
  const photos = [...new Set(images.filter((u) => /^https:\/\//.test(u)))]
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Photo for ${name}`}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {value ? (
            <button type="button" className={BTN_GHOST} onClick={() => onPick(null)}>
              Remove photo
            </button>
          ) : (
            <span />
          )}
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            Done
          </button>
        </div>
      }
    >
      <p className="mb-3 text-[13.5px] text-[#6b7280]">Shown when a buyer picks this variant.</p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {photos.map((url) => (
          <button
            key={url}
            type="button"
            onClick={() => onPick(url)}
            aria-pressed={value === url}
            className={cn("aspect-square overflow-hidden rounded-lg border bg-[#fafafa]", value === url ? "border-[#1a1a2e] shadow-[0_0_0_1px_#1a1a2e]" : "border-[#e5e7eb] hover:border-[#9ca3af]")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
        {uploadImage ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="grid aspect-square place-items-center rounded-lg border border-dashed border-[#d1d5db] text-[#6b7280] hover:border-[#9ca3af] hover:text-[#1a1a2e] disabled:opacity-60"
            aria-label="Upload a photo"
          >
            <span className="flex flex-col items-center gap-1 text-[12px]">
              <Upload className="h-4 w-4" />
              {busy ? "Uploading" : "Upload"}
            </span>
          </button>
        ) : null}
      </div>
      {photos.length === 0 && !uploadImage ? <p className="text-[13.5px] text-[#6b7280]">Add photos to the product first, then pick one here.</p> : null}
      {error ? <Notice className="mt-3">{error}</Notice> : null}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (!file || !uploadImage) return
          setBusy(true)
          setError(null)
          try {
            onPick(await uploadImage(file))
          } catch (err) {
            setError(err instanceof Error ? err.message : "That photo could not be uploaded.")
          } finally {
            setBusy(false)
          }
        }}
      />
    </Modal>
  )
}
