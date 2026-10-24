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
 *   Variants     up to three options (./variant-options.tsx), named as the
 *                seller likes, values typed, renamed and held to reorder,
 *                and every combination as a row (./variant-table.tsx): photo,
 *                price, quantity, and behind it compare at, SKU, barcode,
 *                weight, cost and whether it is sold; Edit all for many
 *   Size chart   which of the store's size charts the product page shows
 *                (./size-chart-card.tsx), made or edited right here
 *   Shipping     shipped or not, weight in the shop's units, the rates it
 *                uses, and who ships it: the store's answer from Settings
 *   Advanced     codes and cost, package size (customs behind one more tap),
 *                tax, brand and tags, and fulfilling this one product some
 *                other way than the store does (lib/physical/fulfilment-default.ts)
 *
 * Every price is in the store's currency (lib/store/currency-context.tsx).
 * Stock typed here is a count: the server records the difference as a
 * movement in the history (lib/physical/inventory-server.ts).
 */

import * as React from "react"
import { ChevronDown, FolderOpen, Plus, Upload, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { COUNTRIES } from "@/lib/checkout/countries"
import { combinationKey, combinations, normaliseOptions, variantName, type Combination } from "@/lib/physical/variants"
import { dimensionUnitFor, fromGrams, fromMm, toGrams, toMm, weightUnitFor, type DimensionUnit, type UnitSystem, type WeightUnit } from "@/lib/physical/units"
import { marginPercent } from "@/lib/physical/totals"
import { METHODS, METHOD_ORDER } from "@/lib/physical/fulfillment"
import { madeToOrder, partnerSentence } from "@/lib/physical/partner"
import { followsStore, fulfilmentSummary, storeFulfilment } from "@/lib/physical/fulfilment-default"
import type { FulfillmentMethod, FulfillmentModel, Location, PhysicalVariant, ProductOption } from "@/lib/physical/types"
import { formatStoreMoney } from "@/lib/store/currency"
import { useStoreCurrency } from "@/lib/store/currency-context"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { MAX_ORDER_LIMIT, readOrderLimit } from "@/lib/physical/order-limit"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, Card, DecimalInput, FIELD, Field, Modal, MoneyInput, Notice, NumberInput, Reveal, SelectInput, TextInput, Toggle, api, centsOf, dollarsOf } from "./ui"
import { barcodeTyped, repeatedSkus, skuTyped } from "@/lib/physical/typed-values"
import { OptionsEditor, optionId, type OptionDraft } from "./variant-options"
import { VariantTable } from "./variant-table"
import { SizeChartCard, type SizeChartHandle } from "./size-chart-card"
/* Redrawn only when the options or their callbacks change, not on every keystroke in a variant row. */
const MemoOptionsEditor = React.memo(OptionsEditor)
import { FilesLibraryChooser } from "@/components/files/files-library"
import { fileThumb } from "@/lib/files/thumb"
import { emptyRow, photoScopes, remapRows, renameValueInRows, rowsForCombinations, variantThumbSrc, type VariantRow } from "./variant-rows"
import { tt } from "@/lib/i18n/text"

export interface PhysicalEditorHandle {
  /** A sentence for what must be fixed before saving, or null. */
  check: () => string | null
  /** Saves everything physical for the product; a sentence on failure, else null. */
  save: (productId: string) => Promise<string | null>
}

type Row = VariantRow

interface ShopSettings {
  unitSystem: UnitSystem
  taxMode: "none" | "manual" | "provider"
  lowStockDefault: number
  lowStockAlerts: boolean
  /** The store's answer to "How you fulfil orders" (Settings › Shipping › Locations). */
  fulfillmentModel: FulfillmentModel | null
  defaultLocationId: string | null
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
  /** Limit sales: the most one order may take; null for none (lib/physical/order-limit.ts). */
  maxPerOrder?: number | null
  options: ProductOption[]
  variants: PhysicalVariant[]
  levels: { variantId: string; locationId: string; onHand: number; committed: number }[]
}

const DEFAULT_SETTINGS: ShopSettings = { unitSystem: "metric", taxMode: "none", lowStockDefault: 5, lowStockAlerts: true, fulfillmentModel: null, defaultLocationId: null }

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

/** Option text cleaned the way lib/physical/variants.ts cleans it, to match an option to its place in the rows. */
const clean = (v: string) => v.replace(/\s+/g, " ").trim().toLowerCase()

export interface PhysicalCardsProps {
  productId: string | null
  basePrice: string
  handle: React.MutableRefObject<PhysicalEditorHandle | null>
  onDirty: () => void
  /** The product's own photos, offered as variant images. */
  images?: string[]
  /** Uploads a new picture for a variant; resolves to its https address. */
  uploadImage?: (file: File) => Promise<string>
  /** Goes to a Settings page from the editor, asking about unsaved changes first (product-editor openSettings). */
  openSettings?: (href: string) => void
  /**
   * Limit sales, typed in the editor's Settings card and saved here with the
   * rest of what is physical. Absent: not sent, so the saved limit stays.
   */
  orderLimit?: OrderLimitDraft
  /** The saved limit, once read, for the Settings card to show. */
  onOrderLimitLoaded?: (limit: OrderLimitDraft) => void
}

/** Limit sales as the Settings card holds it: on or off, and the count as typed. */
export interface OrderLimitDraft {
  on: boolean
  count: string
}

/** A typed limit, checked: a sentence when it cannot be saved, else null. */
export function orderLimitProblem(limit: OrderLimitDraft | undefined): string | null {
  if (!limit?.on) return null
  const n = Number(limit.count)
  return limit.count.trim() && Number.isInteger(n) && n >= 1 && n <= MAX_ORDER_LIMIT ? null : tt("Limit sales: set how many one order can take, 1 to {maxOrderLimit}", { maxOrderLimit: MAX_ORDER_LIMIT })
}

/**
 * A link to Settings from inside the editor: an ordinary link to read and
 * long-press, but a tap stays in the app and goes through the editor's own
 * question about unsaved changes, never a new tab in the iOS or Android app.
 */
const OpenSettingsContext = React.createContext<((href: string) => void) | null>(null)
function SettingsLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const open = React.useContext(OpenSettingsContext)
  return (
    <a
      href={href}
      className={className}
      data-settings-link=""
      onClick={(e) => {
        if (!open || e.metaKey || e.ctrlKey || e.shiftKey) return
        e.preventDefault()
        open(href)
      }}
    >
      {children}
    </a>
  )
}

export function PhysicalProductCards(props: PhysicalCardsProps) {
  const enabled = usePhysicalCommerceEnabled()
  if (!enabled) {
    /* Switched off in /admin: nothing physical is read or written, and nothing is lost. */
    props.handle.current = { check: () => null, save: async () => null }
    return <Notice tone="gray">{tt("Physical products are turned off on Storelib right now. This product's variants, stock and shipping are kept as they are and come back when it's on.")}</Notice>
  }
  return <Cards {...props} />
}

function Cards(props: PhysicalCardsProps) {
  return (
    <OpenSettingsContext.Provider value={props.openSettings ?? null}>
      <CardsInner {...props} />
    </OpenSettingsContext.Provider>
  )
}

const LOCATIONS_HREF = "/app/settings?tab=shipping&section=locations"

function CardsInner({ productId, basePrice, handle, onDirty, images = [], uploadImage, orderLimit, onOrderLimitLoaded }: PhysicalCardsProps) {
  /* Read from apply, which is made once: the editor's latest callback. */
  const limitLoaded = React.useRef(onOrderLimitLoaded)
  limitLoaded.current = onOrderLimitLoaded
  const currency = useStoreCurrency()
  /* The currency these prices were loaded in: a save after the store's currency changed is refused, never written over the converted prices (lib/store/currency-guard). */
  const [formCurrency] = React.useState(currency)
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
  const [customsOpen, setCustomsOpen] = React.useState(false)
  const [profileId, setProfileId] = React.useState("")
  /* Who ships it: the store's answer, unless this product has its own (`ownFulfilment`). */
  const [ownFulfilment, setOwnFulfilment] = React.useState(false)
  const [shipsFrom, setShipsFrom] = React.useState("")
  const [method, setMethod] = React.useState<FulfillmentMethod>("self")
  const [trackInventory, setTrackInventory] = React.useState(true)
  const [continueSelling, setContinueSelling] = React.useState(false)
  const [lowStock, setLowStock] = React.useState("")
  const [taxable, setTaxable] = React.useState(true)
  const [taxCategory, setTaxCategory] = React.useState("")
  const [vendor, setVendor] = React.useState("")
  const [tags, setTags] = React.useState<string[]>([])
  const [advancedOpen, setAdvancedOpen] = React.useState(false)

  const [options, setOptions] = React.useState<OptionDraft[]>([])
  const [rows, setRows] = React.useState<Row[]>([emptyRow([null, null, null])])
  /* Rows whose value was removed, kept for the visit so typing it back restores them (./variant-rows.ts). */
  const stash = React.useRef(new Map<string, Row>())
  const [stockAt, setStockAt] = React.useState("")
  /* The Size chart card (./size-chart-card.tsx): which of the store's charts this product shows, saved after the product's own save. */
  const sizeChart = React.useRef<SizeChartHandle | null>(null)
  const [imageFor, setImageFor] = React.useState<{ keys: string[]; name: string } | null>(null)
  /* "Choose from your files", for the variants the picker was opened for (and the scope chosen in it). */
  const [filesFor, setFilesFor] = React.useState<{ keys: string[]; current: string | null } | null>(null)
  /* Photos still uploading, by row key: the local preview each row shows meanwhile. */
  const [pending, setPending] = React.useState<Record<string, string>>({})
  const [photoError, setPhotoError] = React.useState<string | null>(null)

  const store = React.useMemo(() => storeFulfilment(ctx.settings.fulfillmentModel, ctx.settings.defaultLocationId, ctx.locations), [ctx])

  /* After a save, the option that was open stays open: the save reads everything back, and a list folding shut under the finger read as a jump. */
  const apply = React.useCallback((p: ProductData, storeNow: ReturnType<typeof storeFulfilment>, openBefore: string[] = []) => {
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
    setMethod(p.fulfillmentMethod ?? "self")
    setOwnFulfilment(!followsStore({ method: p.fulfillmentMethod, locationId: p.fulfillmentLocationId }, storeNow))
    setTrackInventory(p.trackInventory)
    setContinueSelling(p.continueSelling)
    setLowStock(p.lowStockThreshold === null ? "" : String(p.lowStockThreshold))
    setTaxable(p.taxable)
    setTaxCategory(p.taxCategory ?? "")
    setVendor(p.vendor ?? "")
    setTags(p.tags ?? [])
    const limit = readOrderLimit(p.maxPerOrder)
    limitLoaded.current?.({ on: limit !== null, count: limit === null ? "" : String(limit) })
    setOptions((prev) =>
      p.options.map((o) => {
        const same = prev.find((x) => clean(x.name) === clean(o.name))
        return { id: same?.id ?? optionId(), name: o.name, values: o.values, open: openBefore.includes(clean(o.name)) }
      }),
    )
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
      const next = { ...context.data, settings }
      setCtx(next)
      setStockAt(context.data.locations.find((l) => l.active)?.id ?? "")
      const storeNow = storeFulfilment(settings.fulfillmentModel, settings.defaultLocationId, context.data.locations)
      if (productId) {
        const got = await api<{ product: ProductData }>(`/api/physical/products/${productId}`)
        if (gone) return
        if (got.ok) apply(got.data.product, storeNow)
        else setLoadError(got.error)
      } else {
        /* A new product is typed in the shop's own units, and follows the store's answer for who ships it. */
        setWeightUnit(weightUnitFor(settings.unitSystem))
        setDimUnit(dimensionUnitFor(settings.unitSystem))
        setMethod(storeNow.method)
        setShipsFrom(storeNow.locationId ?? "")
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

  /* The rows follow the options: every combination, keeping what was typed for each (./variant-rows.ts). */
  const normalised = React.useMemo(() => normaliseOptions(options.map((o) => ({ name: o.name, values: o.values }))), [options])
  React.useEffect(() => {
    let combos: Combination[]
    try {
      combos = combinations(normalised)
    } catch {
      return
    }
    setRows((prev) => rowsForCombinations(combos, prev, stash.current))
  }, [normalised])

  const activeLocations = ctx.locations.filter((l) => l.active)
  const multi = normalised.length > 0
  /*
    PRINTED WHEN IT SELLS (lib/physical/partner.ts madeToOrder): print on demand at a location that holds no stock,
    like the one Printful or Printify made, is never counted there, so it never sells out for want of stock it was
    never meant to have. The switch reads off and is not offered; the server saves it off too (catalog-server).
  */
  const fulfilmentNow = ownFulfilment ? { method, locationId: shipsFrom || null } : store
  const printedAt = madeToOrder(fulfilmentNow.method, ctx.locations.find((l) => l.id === fulfilmentNow.locationId)) ? (ctx.locations.find((l) => l.id === fulfilmentNow.locationId) ?? null) : null
  const counted = trackInventory && !printedAt
  /* Made once (onDirty is the editor's own useCallback), so the memoised variant rows (./variant-table.tsx) redraw only for their own changes. */
  const setRow = React.useCallback((key: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (combinationKey(r.options) === key ? { ...r, ...patch } : r)))
    onDirty()
  }, [onDirty])
  const patchRows = React.useCallback((keys: string[], patch: (r: Row) => Partial<Row>) => {
    const want = new Set(keys)
    setRows((prev) => prev.map((r) => (want.has(combinationKey(r.options)) ? { ...r, ...patch(r) } : r)))
    onDirty()
  }, [onDirty])
  const pickImage = React.useCallback((keys: string[], name: string) => {
    setPhotoError(null)
    setImageFor({ keys, name })
  }, [])
  /*
    A PHOTO UPLOADED FOR A VARIANT IS ITS PHOTO AT ONCE. The picker closes as
    the file is chosen and the rows show a local preview of it while it
    uploads (`pending`), then the uploaded address. Nothing is saved with a
    local address: the rows keep their old photo until the upload answers,
    and a failed upload puts them back and says so above the table.
  */
  const uploadFor = (keys: string[], file: File) => {
    if (!uploadImage) return
    const preview = URL.createObjectURL(file)
    setPending((p) => ({ ...p, ...Object.fromEntries(keys.map((k) => [k, preview])) }))
    setPhotoError(null)
    uploadImage(file)
      .then((url) => {
        /* Warm the small copy the rows will ask for, so the swap from the preview is not a blank square. */
        const warm = new Image()
        warm.src = variantThumbSrc(url)
        const swap = () => {
          patchRows(keys, () => ({ imageUrl: url }))
          setPending((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !keys.includes(k))))
          setTimeout(() => URL.revokeObjectURL(preview), 2000)
        }
        warm.decode().then(swap, swap)
      })
      .catch((err) => {
        setPending((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !keys.includes(k))))
        URL.revokeObjectURL(preview)
        setPhotoError(err instanceof Error && err.message ? err.message : tt("That photo could not be uploaded. Try again."))
      })
  }

  /* Options, with the rows kept in step when a value is renamed or an option moves or goes. */
  /*
    The options editor's callbacks keep their identity across draws (they read
    the latest options through `optionsNow`, and only run on a tap), so the
    memoised editor is not redrawn by a keystroke in a variant's price: that
    redraw (its drag and drop included) was over half of each key's cost.
  */
  const optionsNow = React.useRef({ options, normalised })
  optionsNow.current = { options, normalised }
  const setOptionsDirty = React.useCallback((update: (prev: OptionDraft[]) => OptionDraft[]) => {
    setOptions(update)
    onDirty()
  }, [onDirty])
  const renameValue = React.useCallback((i: number, from: string, to: string) => {
    const { options, normalised } = optionsNow.current
    const position = normalised.findIndex((n) => clean(n.name) === clean(options[i]?.name ?? ""))
    setOptions((prev) => prev.map((o, j) => (j === i ? { ...o, values: o.values.map((v) => (v === from ? to : v)) } : o)))
    if (position >= 0) setRows((prev) => renameValueInRows(prev, position, from, to))
    onDirty()
  }, [onDirty])
  const reshape = React.useCallback((next: OptionDraft[]) => {
    const before = optionsNow.current.normalised.map((o) => o.name)
    const after = normaliseOptions(next.map((o) => ({ name: o.name, values: o.values }))).map((o) => o.name)
    setOptions(next)
    setRows((prev) => remapRows(prev, before, after))
    onDirty()
  }, [onDirty])
  const moveOption = React.useCallback((from: number, to: number) => {
    const next = [...optionsNow.current.options]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    reshape(next)
  }, [reshape])
  const removeOption = React.useCallback((i: number) => reshape(optionsNow.current.options.filter((_, j) => j !== i)), [reshape])

  /*
    A unit changed: what is typed is converted, so 1.5 kg becomes 1500 g and
    not 1.5 g. Grams and millimetres are what is stored, as before; this only
    keeps the shown number the same weight or size.
  */
  const convertWeight = (typed: string, from: WeightUnit, to: WeightUnit) => {
    if (!typed.trim()) return typed
    const g = toGrams(typed, from)
    return g === null ? typed : String(fromGrams(g, to) ?? "")
  }
  const changeWeightUnit = (to: WeightUnit) => {
    const from = weightUnit
    if (to === from) return
    setWeight((w) => convertWeight(w, from, to))
    setRows((prev) => prev.map((r) => (r.weight.trim() ? { ...r, weight: convertWeight(r.weight, from, to) } : r)))
    changed(setWeightUnit)(to)
  }
  const changeDimUnit = (to: DimensionUnit) => {
    const from = dimUnit
    if (to === from) return
    const conv = (typed: string) => {
      if (!typed.trim()) return typed
      const mm = toMm(typed, from)
      return mm === null ? typed : String(fromMm(mm, to) ?? "")
    }
    setDims((d) => ({ l: conv(d.l), w: conv(d.w), h: conv(d.h) }))
    changed(setDimUnit)(to)
  }

  /* Its own fulfilment: where it ships from is one of the seller's places for "myself", a partner of the right kind otherwise. */
  const partners = activeLocations.filter((l) => METHODS[method].locationKinds.includes(l.kind))
  const pickMethod = (m: FulfillmentMethod) => {
    changed(setMethod)(m)
    const here = ctx.locations.find((l) => l.id === shipsFrom)
    if (here && !METHODS[m].locationKinds.includes(here.kind)) setShipsFrom("")
  }
  const chooseOwnFulfilment = (on: boolean) => {
    changed(setOwnFulfilment)(on)
    if (on) {
      /* Starts from the store's answer, so turning it on changes nothing until something is picked. */
      setMethod(store.method)
      setShipsFrom(store.locationId ?? "")
    }
  }

  handle.current = {
    check: () => {
      if (loading) return tt("Wait for the stock and shipping details to load.")
      for (const o of options) {
        if (o.name.trim() && o.values.length === 0) return tt("Add a value to {value}", { value: o.name.trim() })
        if (!o.name.trim() && o.values.length) return tt("Name every option, like Size or Color")
      }
      const names = options.map((o) => clean(o.name)).filter(Boolean)
      if (new Set(names).size !== names.length) return tt("Two options have the same name")
      if (rows.length > 250) return tt("Up to 250 variants. Remove some option values.")
      const base = centsOf(basePrice)
      for (const r of rows) {
        if (!r.active) continue
        const p = centsOf(r.price) ?? base
        /* $0 is a price: a free sample or a gift sells at nothing (checkout places a free order with no card). Between nothing and the smallest card payment is not. */
        if (p === null) return multi ? tt("Set a price for {name}", { name: variantName(r.options) }) : tt("Set a price")
        if (p > 0 && p < 50) return multi ? tt("{name}: $0 or at least {amount}", { name: variantName(r.options), amount: formatStoreMoney(50, currency) }) : tt("$0 or at least {amount}", { amount: formatStoreMoney(50, currency) })
      }
      if (rows.every((r) => !r.active)) return tt("Sell at least one variant")
      if (repeatedSkus(rows.map((r) => r.sku)).size) return tt("Two variants have the same SKU")
      if (requiresShipping && weight.trim() && toGrams(weight, weightUnit) === null) return tt("Check the weight")
      if (ownFulfilment && method !== "self" && !shipsFrom) return tt("Choose who fulfils it, under Advanced")
      return orderLimitProblem(orderLimit)
    },
    save: async (id: string) => {
      const opts = normalised.map((o) => ({ name: o.name, values: o.values }))
      const variants = rows.map((r) => {
        const stock: Record<string, number> = {}
        if (counted) {
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
      /* Following the store: today's answer is written, so checkout and the order jobs read it as before. */
      const fulfilment = ownFulfilment ? { method, locationId: shipsFrom || null } : store
      const res = await api<{ product: ProductData }>(`/api/physical/products/${id}`, {
        method: "PUT",
        body: {
          vendor: vendor.trim() || null,
          tags,
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
          trackInventory: counted,
          continueSelling,
          lowStockThreshold: lowStock.trim() ? Number(lowStock) : null,
          fulfillmentMethod: fulfilment.method,
          fulfillmentLocationId: fulfilment.locationId,
          shippingProfileId: profileId || null,
          /* A limit that can't be read (only possible in a draft saved on the way to Settings) leaves the saved one as it is. */
          ...(orderLimit && !orderLimitProblem(orderLimit) ? { maxPerOrder: orderLimit.on ? Number(orderLimit.count) : null } : {}),
          options: opts,
          variants,
          formCurrency,
        },
      })
      if (!res.ok) return res.error
      stash.current.clear()
      apply(res.data.product, store, options.filter((o) => o.open).map((o) => clean(o.name)))
      return (await sizeChart.current?.save(id)) ?? null
    },
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label={tt("Loading stock and shipping")}>
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
  const imageRows = imageFor ? rows.filter((r) => imageFor.keys.includes(combinationKey(r.options))) : []
  const imageNow = imageRows.length && imageRows.every((r) => r.imageUrl === imageRows[0].imageUrl) ? imageRows[0].imageUrl : null
  /* One variant's photo can go on every variant that shares one of its values: a colour's photo for every size. */
  const imageScopes = imageFor ? photoScopes(imageFor.keys, imageFor.name, rows, normalised) : []
  const storeLine = fulfilmentSummary(store, ctx.locations)
  const ownLine = fulfilmentSummary({ method, locationId: method === "self" ? null : shipsFrom || null }, ctx.locations) + (method === "self" && shipsFrom ? tt(", from {value}", { value: ctx.locations.find((l) => l.id === shipsFrom)?.name ?? tt("one place") }) : "")
  const nonDefaultProfiles = ctx.profiles.filter((p) => !p.isDefault)
  const generalName = ctx.profiles.find((p) => p.isDefault)?.name ?? tt("General")
  const advancedSet = [
    !multi && single?.sku.trim() ? tt("SKU {value}", { value: single.sku.trim() }) : "",
    !multi && single?.cost.trim() ? tt("cost") : "",
    requiresShipping && (dims.l || dims.w || dims.h) ? tt("package size") : "",
    requiresShipping && (origin || hsCode) ? tt("customs") : "",
    !taxable ? tt("no tax") : "",
    vendor.trim() ? vendor.trim() : "",
    tags.length ? tt("{n, plural, one {# tag} other {# tags}}", { n: tags.length }) : "",
    ownFulfilment ? tt("its own fulfilment") : "",
  ].filter(Boolean)
  const openFulfilment = () => {
    setAdvancedOpen(true)
    requestAnimationFrame(() => document.getElementById("physical-advanced-fulfilment")?.scrollIntoView({ behavior: "smooth", block: "center" }))
  }

  return (
    <div className="space-y-4 sm:space-y-5" data-physical-cards="">
      {/* ── Inventory ────────────────────────────────────────────────── */}
      <Card id="physical-inventory" title={tt("Inventory")} description={printedAt ? tt("Not counted: {value} makes each one when it sells, so it never shows as sold out.", { value: printedAt.partner?.name ?? printedAt.name }) : trackInventory ? tt("Stock goes down with every sale. Nobody can buy more than you have.") : tt("Not counted: it can always be bought.")}>
        <div className="space-y-4">
          {printedAt ? (
            <p className="text-[13.5px] leading-5 text-[#4b5563]" data-made-to-order="">
              {tt("To count stock, have it fulfilled from one of your own locations.")}
            </p>
          ) : (
            <Toggle label={tt("Track inventory")} description={tt("Count how many you have and stop selling at zero.")} checked={trackInventory} onChange={changed(setTrackInventory)} />
          )}
          {counted && !multi && single ? (
            activeLocations.length === 0 ? (
              <Notice tone="amber">
                {tt("Add the place you keep stock first.")}{" "}
                <SettingsLink href={LOCATIONS_HREF} className="font-medium underline underline-offset-2">
                  {tt("Add a location")}
                </SettingsLink>
              </Notice>
            ) : onlyLocation ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={tt("Quantity")} hint={(single.committed[onlyLocation.id] ?? 0) > 0 ? tt("{value} held for unshipped orders", { value: single.committed[onlyLocation.id] }) : tt("How many you have right now")}>
                  <NumberInput aria-label={tt("Quantity")} placeholder="0" value={single.stock[onlyLocation.id] ?? ""} onChange={(v) => setRow(singleKey, { stock: { ...single.stock, [onlyLocation.id]: v } })} />
                </Field>
                <Field label={tt("Low stock alert")} hint={ctx.settings.lowStockAlerts ? tt("We email you when it drops to this") : tt("Marked Low on Inventory at this")}>
                  <NumberInput value={lowStock} placeholder={String(lowDefault)} onChange={(v) => changed(setLowStock)(v.slice(0, 5))} />
                </Field>
              </div>
            ) : (
              <div className="space-y-2">
                {activeLocations.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#eceef1] px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{l.name}</p>
                      <p className="text-[12px] text-[#6b7280]">{(single.committed[l.id] ?? 0) > 0 ? tt("{value} held for unshipped orders", { value: single.committed[l.id] }) : tt("Quantity")}</p>
                    </div>
                    <NumberInput aria-label={tt("Quantity at {name}", { name: l.name })} placeholder="0" value={single.stock[l.id] ?? ""} onChange={(v) => setRow(singleKey, { stock: { ...single.stock, [l.id]: v } })} className="w-[110px] text-right" />
                  </div>
                ))}
              </div>
            )
          ) : null}
          {counted && multi ? <p className="text-[13px] text-[#6b7280]">{tt("Each variant has its own quantity, in Variants below.")}</p> : null}
          {counted && (multi || !onlyLocation) ? (
            <Field label={tt("Low stock alert")} hint={ctx.settings.lowStockAlerts ? tt("We email you when a variant drops to this") : tt("Marked Low on Inventory at this")} className="sm:max-w-[260px]">
              <NumberInput value={lowStock} placeholder={String(lowDefault)} onChange={(v) => changed(setLowStock)(v.slice(0, 5))} />
            </Field>
          ) : null}
          {counted ? <Toggle label={tt("Keep selling when out of stock")} description={tt("Buyers can still order, and you ship when it's back.")} checked={continueSelling} onChange={changed(setContinueSelling)} /> : null}
        </div>
      </Card>

      {/* ── Variants ─────────────────────────────────────────────────── */}
      <Card id="physical-variants" title={tt("Variants")} description={multi ? tt("Every combination of your options is a variant with its own price, stock and photo.") : tt("Sizes, colors or anything else it comes in. Each one gets its own price, stock and photo.")}>
        <MemoOptionsEditor options={options} setOptions={setOptionsDirty} renameValue={renameValue} moveOption={moveOption} removeOption={removeOption} />
        {multi ? (
          <VariantTable
            rows={rows}
            options={normalised}
            basePrice={basePrice}
            trackInventory={counted}
            locations={activeLocations}
            stockAt={stockAt}
            setStockAt={setStockAt}
            weightUnit={weightUnit}
            setRow={setRow}
            patchRows={patchRows}
            pickImage={pickImage}
            pending={pending}
          />
        ) : null}
        {multi && photoError ? <Notice className="mt-3">{photoError}</Notice> : null}
      </Card>

      {/* ── Size chart ───────────────────────────────────────────────── */}
      <SizeChartCard productId={productId} handle={sizeChart} onDirty={onDirty} uploadImage={uploadImage} />

      {/* ── Shipping ─────────────────────────────────────────────────── */}
      {/* No "not shipped" switch: a physical product is always shipped or picked up, so checkout always asks where it goes (lib/physical/checkout-pricing-server). Handing it over in person is local pickup. */}
      <Card id="physical-shipping" title={tt("Shipping")} description={tt("Used to work out delivery at checkout. To hand it over in person, turn on local pickup in Settings › Shipping.")}>
        <div className="space-y-4">
          {requiresShipping ? (
            <div className={cn("grid gap-3", nonDefaultProfiles.length ? "sm:grid-cols-[minmax(0,1fr)_110px_minmax(0,1.3fr)]" : "grid-cols-[minmax(0,1fr)_110px] sm:max-w-[420px]")}>
              <Field label={tt("Weight")} hint={tt("With its packaging")}>
                <DecimalInput value={weight} onChange={changed(setWeight)} placeholder="0.0" aria-label={tt("Weight")} />
              </Field>
              <Field label={tt("Unit")}>
                <SelectInput value={weightUnit} onChange={(v) => changeWeightUnit(v as WeightUnit)} aria-label={tt("Weight unit")}>
                  <option value="kg">{tt("kg")}</option>
                  <option value="g">g</option>
                  <option value="lb">{tt("lb")}</option>
                  <option value="oz">{tt("oz")}</option>
                </SelectInput>
              </Field>
              {/* Rates: one choice only when the store has more than its general rates. */}
              {nonDefaultProfiles.length ? (
                <Field
                  label={tt("Shipping rates")}
                  hint={
                    <SettingsLink href="/app/settings?tab=shipping&section=delivery" className="underline underline-offset-2">
                      {tt("Edit shipping rates")}
                    </SettingsLink>
                  }
                >
                  <SelectInput value={profileId} onChange={changed(setProfileId)} aria-label={tt("Shipping rates")}>
                    <option value="">{tt("{generalName} (all products)", { generalName })}</option>
                    {nonDefaultProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
              ) : null}
            </div>
          ) : null}
          {requiresShipping && ctx.profiles.every((p) => (p.zoneCount ?? 0) === 0) ? (
            <Notice tone="amber">
              {tt("You haven't set where you ship yet, so buyers can't check out.")}{" "}
              <SettingsLink href="/app/settings?tab=shipping&section=delivery" className="font-medium underline underline-offset-2">
                {tt("Set up shipping")}
              </SettingsLink>
            </Notice>
          ) : null}
          {/* Who ships it: one line, the store's answer from Settings; a product with its own says so. */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-[#f7f7f8] px-3.5 py-2.5" data-shipped-by="">
            <p className="min-w-0 text-[13.5px] leading-5 text-[#4b5563]">
              <span className="font-medium text-[#1a1a2e]">{ownFulfilment ? ownLine : storeLine}</span>
              <span className="text-[#6b7280]">{ownFulfilment ? tt(" · this product only") : tt(" · your store setting")}</span>
            </p>
            {ownFulfilment ? (
              <button type="button" onClick={openFulfilment} className="text-[13px] font-medium text-[#1a1a2e] underline underline-offset-2">
                {tt("Change")}
              </button>
            ) : (
              <SettingsLink href={LOCATIONS_HREF} className="text-[13px] font-medium text-[#1a1a2e] underline underline-offset-2">
                {tt("Change in Settings")}
              </SettingsLink>
            )}
          </div>
        </div>
      </Card>

      {/* ── Advanced ─────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" id="physical-advanced">
        <button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left sm:px-6">
          <span className="min-w-0">
            <span className="block text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]">{tt("Advanced")}</span>
            <span className="block truncate text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">{advancedSet.length ? advancedSet.join(", ") : multi ? tt("Package size, tax, brand, tags and who fulfils it") : tt("SKU, barcode, cost, package size, tax, brand and tags")}</span>
          </span>
          <ChevronDown className={cn("h-5 w-5 shrink-0 text-[#6b7280] transition-transform duration-200", advancedOpen && "rotate-180")} />
        </button>
        {/* Folds out under its line (Reveal) rather than appearing all at once. */}
        <Reveal open={advancedOpen}>
          <div className="divide-y divide-[#f1f2f4] border-t border-[#eceef1]" data-physical-advanced="">
            {!multi && single ? (
              <Group title={tt("Codes and cost")}>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="SKU" hint={tt("Your code. On orders and packing slips.")}>
                    <TextInput value={single.sku} maxLength={64} autoComplete="off" placeholder={tt("MUG-BLK-11")} onChange={(e) => setRow(singleKey, { sku: skuTyped(e.target.value) })} />
                  </Field>
                  <Field label={tt("Barcode")} hint={tt("ISBN, UPC, EAN or GTIN")}>
                    <TextInput value={single.barcode} maxLength={14} inputMode="numeric" autoComplete="off" placeholder="5901234123457" onChange={(e) => setRow(singleKey, { barcode: barcodeTyped(e.target.value) })} />
                  </Field>
                  <Field label={tt("Cost per item")} hint={marginOf(single) ? tt("{single} margin. Buyers never see this.", { single: marginOf(single) }) : tt("What one costs you. Buyers never see this.")}>
                    <MoneyInput value={single.cost} onChange={(v) => setRow(singleKey, { cost: v })} />
                  </Field>
                </div>
              </Group>
            ) : null}
            {requiresShipping ? (
              <Group title={tt("Package size")} hint={tt("Boxed, for carriers that price by size. Empty uses your default package.")}>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-[1fr_1fr_1fr_100px] sm:gap-3">
                  <Field label={tt("Length")}>
                    <DecimalInput value={dims.l} placeholder="20" onChange={(v) => changed(setDims)((d) => ({ ...d, l: v }))} />
                  </Field>
                  <Field label={tt("Width")}>
                    <DecimalInput value={dims.w} placeholder="15" onChange={(v) => changed(setDims)((d) => ({ ...d, w: v }))} />
                  </Field>
                  <Field label={tt("Height")}>
                    <DecimalInput value={dims.h} placeholder="10" onChange={(v) => changed(setDims)((d) => ({ ...d, h: v }))} />
                  </Field>
                  <Field label={tt("Unit")} className="col-span-3 sm:col-span-1">
                    <SelectInput value={dimUnit} onChange={(v) => changeDimUnit(v as DimensionUnit)} aria-label={tt("Size unit")}>
                      <option value="cm">{tt("cm")}</option>
                      <option value="in">{tt("in")}</option>
                    </SelectInput>
                  </Field>
                </div>
                {customsOpen ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2" data-customs="">
                    <Field label={tt("Country of origin")} hint={tt("Where it was made, for customs forms")}>
                      <SelectInput value={origin} onChange={changed(setOrigin)}>
                        <option value="">{tt("Not set")}</option>
                        {COUNTRIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label={tt("HS code")} hint={tt("For international customs")}>
                      <TextInput value={hsCode} inputMode="numeric" maxLength={14} onChange={(e) => changed(setHsCode)(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="6109.10" />
                    </Field>
                  </div>
                ) : (
                  <button type="button" onClick={() => setCustomsOpen(true)} className={cn(BTN_GHOST, "-ml-2 mt-2 h-8 px-2 text-[13px]")}>
                    <Plus className="h-3.5 w-3.5" />
                    {tt("Customs info, for shipping abroad")}
                  </button>
                )}
              </Group>
            ) : null}
            <Group title={tt("Tax")}>
              <div className="space-y-3">
                <Toggle
                  label={tt("Charge tax on this product")}
                  description={
                    ctx.settings.taxMode === "manual" ? (
                      tt("Your tax rates apply at checkout.")
                    ) : (
                      <>
                        {tt("Your shop doesn't charge tax yet.")}{" "}
                        <SettingsLink href="/app/settings?tab=taxes" className="underline underline-offset-2">
                          {tt("Set up tax")}
                        </SettingsLink>
                      </>
                    )
                  }
                  checked={taxable}
                  onChange={changed(setTaxable)}
                />
                {taxable && (ctx.settings.taxMode === "manual" || taxCategory) ? (
                  <Field label={tt("Tax category")} hint={tt("Optional, for your records and your accountant")} className="sm:max-w-[360px]">
                    <TextInput value={taxCategory} maxLength={60} onChange={(e) => changed(setTaxCategory)(e.target.value)} placeholder={tt("Clothing")} />
                  </Field>
                ) : null}
              </div>
            </Group>
            <Group title={tt("Brand and tags")} hint={tt("Collections and search can use them.")}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={tt("Brand or maker")}>
                  <TextInput value={vendor} maxLength={120} placeholder={tt("Brand name")} onChange={(e) => changed(setVendor)(e.target.value)} />
                </Field>
                <Field label={tt("Tags")} hint={tt("Press Enter after each one")}>
                  <TagInput value={tags} onChange={changed(setTags)} />
                </Field>
              </div>
            </Group>
            <div id="physical-advanced-fulfilment" className="scroll-mt-4">
              <Group title={tt("Fulfilment")}>
                <div className="space-y-4">
                  <Toggle
                    label={tt("Fulfil this product differently")}
                    description={ownFulfilment ? tt("This product has its own answer. Your other products keep the store setting.") : tt("Off, it follows your store setting: {value}{value2}.", { value: storeLine.charAt(0).toLowerCase(), value2: storeLine.slice(1) })}
                    checked={ownFulfilment}
                    onChange={chooseOwnFulfilment}
                  />
                  {ownFulfilment ? (
                    <OwnFulfilment
                      method={method}
                      pickMethod={pickMethod}
                      partners={partners}
                      shipsFrom={shipsFrom}
                      setShipsFrom={changed(setShipsFrom)}
                      manyPlaces={activeLocations.length > 1}
                      onCreated={(loc) => {
                        setCtx((c) => ({ ...c, locations: [...c.locations, loc] }))
                        changed(setShipsFrom)(loc.id)
                      }}
                    />
                  ) : null}
                </div>
              </Group>
            </div>
          </div>
        </Reveal>
      </section>

      <VariantImagePicker
        open={!!imageFor}
        name={imageFor?.name ?? ""}
        value={imageNow}
        images={images}
        scopes={imageScopes}
        canUpload={!!uploadImage}
        onClose={() => setImageFor(null)}
        onPick={(url, keys) => {
          patchRows(keys, () => ({ imageUrl: url }))
          setImageFor(null)
        }}
        onUpload={(file, keys) => {
          setImageFor(null)
          uploadFor(keys, file)
        }}
        onBrowse={(keys) => {
          setImageFor(null)
          setFilesFor({ keys, current: imageNow })
        }}
      />
      <FilesLibraryChooser
        open={!!filesFor}
        onClose={() => setFilesFor(null)}
        selectedUrl={filesFor?.current ?? null}
        onPick={(url) => {
          if (filesFor) patchRows(filesFor.keys, () => ({ imageUrl: url }))
        }}
      />
    </div>
  )
}

/** One part of Advanced: a short heading, an optional line, its fields. */
function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-4 sm:px-6 sm:py-5" data-advanced-group={title}>
      <p className="text-[14px] font-semibold text-[#1a1a2e]">{title}</p>
      {hint ? <p className="mt-0.5 text-[13px] leading-5 text-[#6b7280]">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </div>
  )
}

/** Tags as chips: Enter, a comma or leaving the field adds one; the x removes it. Up to 50, 40 letters each, as the server keeps them. */
function TagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = React.useState("")
  const add = (text: string) => {
    const parts = text.split(",").map((t) => t.trim().slice(0, 40)).filter(Boolean)
    const next = [...value]
    for (const p of parts) if (!next.some((t) => t.toLowerCase() === p.toLowerCase()) && next.length < 50) next.push(p)
    if (next.length !== value.length) onChange(next)
    setDraft("")
  }
  return (
    <div className={cn(FIELD, "flex h-auto min-h-11 flex-wrap items-center gap-1.5 py-1.5 sm:min-h-10")} data-tag-input="">
      {value.map((t) => (
        <span key={t} className="inline-flex h-7 items-center gap-1 rounded-md bg-[#f1f2f4] pl-2 pr-0.5 text-[13px] text-[#374151]">
          {t}
          <button type="button" aria-label={tt("Remove tag {t}", { t })} onClick={() => onChange(value.filter((x) => x !== t))} className="grid h-6 w-6 place-items-center rounded hover:bg-[#e2e3e7]">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        aria-label={tt("Add a tag")}
        value={draft}
        placeholder={value.length ? "" : "summer, linen"}
        onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            add(draft)
          } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={() => add(draft)}
        className="h-7 min-w-[90px] flex-1 border-0 bg-transparent p-0 text-[15px] outline-none placeholder:text-[#9ca3af] sm:text-[14px]"
      />
    </div>
  )
}

/** This product's own answer: four plain choices, and who does it. */
function OwnFulfilment({
  method,
  pickMethod,
  partners,
  shipsFrom,
  setShipsFrom,
  manyPlaces,
  onCreated,
}: {
  method: FulfillmentMethod
  pickMethod: (m: FulfillmentMethod) => void
  partners: Location[]
  shipsFrom: string
  setShipsFrom: (id: string) => void
  manyPlaces: boolean
  onCreated: (l: Location) => void
}) {
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={tt("How is this product fulfilled?")} className="overflow-hidden rounded-xl border border-[#e5e7eb]">
        {METHOD_ORDER.map((m) => {
          const on = method === m
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pickMethod(m)}
              data-fulfil-method={m}
              className={cn("flex w-full items-start gap-3 border-b border-[#eceef1] px-3.5 py-3 text-left transition-colors last:border-b-0", on ? "bg-[#fafafa]" : "hover:bg-[#f8f9fa]")}
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
        manyPlaces ? (
          <Field label={tt("Ships from")} hint={tt("Any picks the place with stock")} className="sm:max-w-[360px]">
            <SelectInput value={shipsFrom} onChange={setShipsFrom}>
              <option value="">{tt("Any of my locations")}</option>
              {partners.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        ) : null
      ) : (
        <PartnerPicker method={method} partners={partners} value={shipsFrom} onChange={setShipsFrom} onCreated={onCreated} />
      )}
      <p className="text-[13px] leading-5 text-[#6b7280]">
        <span className="font-medium text-[#4b5563]">{tt("After a sale:")} </span>
        {(() => {
          const here = method === "self" ? null : partners.find((p) => p.id === shipsFrom)
          return here?.forwarding === "provider" && here.partner?.connected ? tt("The order goes to {name} by each variant's SKU, and its tracking comes back to your buyer by itself.", { name: here.partner.name }) : METHODS[method].afterSale
        })()}
      </p>
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
  const label = method === "warehouse" ? tt("Warehouse") : method === "dropship" ? tt("Supplier") : tt("Print partner")
  const chosen = partners.find((p) => p.id === value) ?? null

  if (adding) {
    return (
      <div className="space-y-3 rounded-xl border border-[#eceef1] bg-[#fcfcfd] p-3" data-partner-form="">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tt("{label} name", { label })}>
            <TextInput value={name} maxLength={80} placeholder={method === "print_on_demand" ? tt("My print shop") : method === "dropship" ? tt("My supplier") : tt("My warehouse")} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={tt("Their orders email")} hint={tt("Optional. Each paid order for this product is emailed here with the items and address. Empty: you pass orders on yourself.")}>
            <TextInput value={email} maxLength={254} inputMode="email" placeholder="orders@example.com" onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        {error ? <Notice>{error}</Notice> : null}
        <div className="flex justify-end gap-2">
          {partners.length > 0 ? (
            <button type="button" className={BTN_SECONDARY} onClick={() => setAdding(false)}>
              {tt("Cancel")}
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
            {busy ? tt("Adding") : tt("Add {value}", { value: label.toLowerCase() })}
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
            <option value="">{tt("Choose")}</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <button type="button" className={BTN_SECONDARY} onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          {tt("New")}
        </button>
      </div>
      {chosen ? (
        <p className="text-[12.5px] text-[#6b7280]">
          {partnerSentence(chosen)}{" "}
          <SettingsLink href={LOCATIONS_HREF} className="underline underline-offset-2">
            {tt("Change")}
          </SettingsLink>
        </p>
      ) : (
        <p className="text-[12.5px] text-[#b45309]">{tt("Choose who fulfils it, so orders reach them.")}</p>
      )}
    </div>
  )
}

/**
 * A variant's photo, chosen in one tap. The product's own photos first, as
 * small copies (lib/files/thumb.ts) at a fixed square so nothing moves as
 * they arrive; then Upload, and Your files ("Choose from your files", the
 * app's one picker). With two options or more, a row of choices says which
 * variants get it: only this one, or every variant with its colour or size.
 * Choosing closes the picker and the row has the photo at once; an upload
 * shows its preview in the row while it runs (CardsInner.uploadFor).
 */
function VariantImagePicker({
  open,
  name,
  value,
  images,
  scopes,
  canUpload,
  onClose,
  onPick,
  onUpload,
  onBrowse,
}: {
  open: boolean
  name: string
  value: string | null
  images: string[]
  scopes: { label: string; keys: string[] }[]
  canUpload: boolean
  onClose: () => void
  onPick: (url: string | null, keys: string[]) => void
  onUpload: (file: File, keys: string[]) => void
  onBrowse: (keys: string[]) => void
}) {
  const input = React.useRef<HTMLInputElement>(null)
  const [scope, setScope] = React.useState(0)
  const photos = React.useMemo(() => [...new Set(images.filter((u) => /^https:\/\//.test(u)))], [images])
  /* Each opening starts on "only this one". */
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setScope(0)
  }
  /* The small copy each row draws, fetched while the picker is open: a photo chosen shows in its row at once. */
  React.useEffect(() => {
    if (!open) return
    for (const url of photos) {
      const img = new Image()
      img.src = variantThumbSrc(url)
    }
  }, [open, photos])
  const keys = (scopes[scope] ?? scopes[0])?.keys ?? []
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tt("Photo for {name}", { name })}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {value ? (
            <button type="button" className={BTN_GHOST} onClick={() => onPick(null, keys)} data-variant-photo-remove="">
              {tt("Remove photo")}
            </button>
          ) : (
            <span />
          )}
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            {tt("Done")}
          </button>
        </div>
      }
    >
      {scopes.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label={tt("Which variants get the photo")} data-variant-photo-scope="">
          {scopes.map((s, i) => (
            <button
              key={s.label}
              type="button"
              role="radio"
              aria-checked={scope === i}
              onClick={() => setScope(i)}
              className={cn(
                "h-8 rounded-full border px-3 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#9ca3af]/50",
                scope === i ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#e5e7eb] bg-white text-[#4b5563] hover:border-[#9ca3af]",
              )}
            >
              {s.label}
              {s.keys.length > 1 ? <span className={cn("ml-1 tabular-nums", scope === i ? "text-white/70" : "text-[#9ca3af]")}>{s.keys.length}</span> : null}
            </button>
          ))}
        </div>
      ) : (
        <p className="mb-3 text-[13.5px] text-[#6b7280]">{tt("Shown when a buyer picks this variant.")}</p>
      )}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5" data-variant-photo-grid="">
        {photos.map((url) => {
          const t = fileThumb(url)
          return (
            <button
              key={url}
              type="button"
              onClick={() => onPick(url, keys)}
              aria-pressed={value === url}
              aria-label={value === url ? tt("This photo, chosen") : tt("Use this photo")}
              data-variant-photo-choice=""
              className={cn("aspect-square overflow-hidden rounded-lg border bg-[#f3f4f6] outline-none focus-visible:ring-2 focus-visible:ring-[#9ca3af]/50", value === url ? "border-[#1a1a2e] shadow-[0_0_0_1px_#1a1a2e]" : "border-[#e5e7eb] hover:border-[#9ca3af]")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.src} srcSet={t.srcSet} sizes="(max-width: 639px) 25vw, 128px" alt="" decoding="async" draggable={false} onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "")} className="h-full w-full object-cover opacity-0 transition-opacity duration-150 data-[loaded]:opacity-100" />
            </button>
          )
        })}
        {canUpload ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="grid aspect-square place-items-center rounded-lg border border-dashed border-[#d1d5db] text-[#6b7280] hover:border-[#9ca3af] hover:text-[#1a1a2e]"
            aria-label={tt("Upload a photo")}
          >
            <span className="flex flex-col items-center gap-1 text-[12px]">
              <Upload className="h-4 w-4" />
              {tt("Upload")}
            </span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onBrowse(keys)}
          className="grid aspect-square place-items-center rounded-lg border border-dashed border-[#d1d5db] text-[#6b7280] hover:border-[#9ca3af] hover:text-[#1a1a2e]"
          aria-label={tt("Choose from your files")}
          data-variant-photo-files=""
        >
          <span className="flex flex-col items-center gap-1 text-center text-[12px] leading-[14px]">
            <FolderOpen className="h-4 w-4" />
            {tt("Your files")}
          </span>
        </button>
      </div>
      {photos.length === 0 ? <p className="mt-3 text-[13px] text-[#6b7280]">{tt("Photos you add to the product show here first.")}</p> : null}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) onUpload(file, keys)
        }}
      />
    </Modal>
  )
}
