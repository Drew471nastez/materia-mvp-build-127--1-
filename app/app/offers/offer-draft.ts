/**
 * An offer as the editor holds it while it is being changed (./offer-editor.tsx),
 * and the two ways across: from a saved offer to the form's fields
 * (draftOf), and from the fields to what the server reads (bodyOf, checked
 * again there by lib/offers/offers.ts readOffer). problemsOf says what is
 * wrong with each field in plain words, before anything is sent. Plain
 * functions, so tests/offers-v.test.ts checks every setting's way through.
 */
import { tt } from "@/lib/i18n/text"
import { MAX_BUNDLE, MAX_PER_ORDER, MAX_PERCENT, PLACEMENTS_FOR, type DiscountType, type Offer, type OfferKind, type Placement } from "@/lib/offers/offers"
import { MAX_FREE_QUANTITY, MAX_TIERS, MAX_TIER_PERCENT, MAX_TIER_QUANTITY, tierDiscounts, type Tier, type TierDiscountType } from "@/lib/offers/pricing"
import { minorDigits } from "./offer-money"

export type Condition = "any" | "products" | "collections"

/** A quantity break's tier as the editor holds it: the amounts as typed. */
export interface TierDraft {
  quantity: string
  freeQuantity: string
  discountType: TierDiscountType
  /** A percent, or an amount in the store's currency as typed. */
  value: string
  label: string
  badge: string
}

export interface Draft {
  kind: OfferKind
  title: string
  productIds: string[]
  condition: Condition
  triggerIds: string[]
  triggerCollectionIds: string[]
  minSubtotal: string
  discountType: DiscountType
  amount: string
  placements: Placement[]
  startsAt: string
  endsAt: string
  maxPerOrder: string
  combinesWithCodes: boolean
  active: boolean
  /** A quantity break: for one product, or one collection. */
  scope: "product" | "collection"
  tiers: TierDraft[]
}

/** A new quantity break's tiers: Buy 2 get 1 free, then Buy 3 get 2 free, each block bigger than the one before. */
export const STARTER_TIERS = (): TierDraft[] => [
  { quantity: "2", freeQuantity: "1", discountType: "none", value: "", label: "", badge: "" },
  { quantity: "3", freeQuantity: "2", discountType: "none", value: "", label: "", badge: "" },
]

const tierDraftOf = (t: Tier, currency: string): TierDraft => ({
  quantity: String(t.quantity),
  freeQuantity: String(t.freeQuantity),
  discountType: t.discountType,
  value: t.discountType === "amount" ? amountOf(t.discountValue, currency) : t.discountType === "percent" ? String(t.discountValue) : "",
  label: t.label,
  badge: t.badge,
})

/** A tier draft as the server reads it (lib/offers/pricing readTiers); a blank label gets the tier's own words there. */
export function tierOf(t: TierDraft, currency: string): Tier {
  const n = (s: string) => (s.trim() === "" ? 0 : Math.floor(Number(s)))
  const discountValue = t.discountType === "amount" ? minorOf(t.value, currency) : t.discountType === "percent" ? n(t.value) : 0
  return { quantity: n(t.quantity), freeQuantity: n(t.freeQuantity), discountType: t.discountType, discountValue, label: t.label.trim(), badge: t.badge.trim() }
}

/** A time for an <input type="datetime-local">, in this computer's zone. */
export const localInput = (iso: string | null | undefined) => {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const fromInput = (v: string) => (v ? new Date(v).toISOString() : null)

export const amountOf = (minor: number, currency: string) => {
  const digits = minorDigits(currency)
  return digits === 0 ? String(minor) : (minor / 10 ** digits).toFixed(digits)
}
export const minorOf = (text: string, currency: string) => {
  const n = Number(text.replace(",", ".").trim())
  return Number.isFinite(n) ? Math.round(n * 10 ** minorDigits(currency)) : NaN
}

export function draftOf(o: Offer | null, kind: OfferKind, currency: string): Draft {
  if (!o) {
    const title = kind === "bundle" ? tt("Buy it together") : kind === "quantity_break" ? tt("Buy more, save more") : tt("Add to your order")
    return { kind, title, productIds: [], condition: "any", triggerIds: [], triggerCollectionIds: [], minSubtotal: "", discountType: kind === "quantity_break" ? "none" : "percent", amount: kind === "quantity_break" ? "" : "10", placements: [...PLACEMENTS_FOR[kind]], startsAt: "", endsAt: "", maxPerOrder: "", combinesWithCodes: true, active: true, scope: "product", tiers: kind === "quantity_break" ? STARTER_TIERS() : [] }
  }
  const colls = o.triggerCollectionIds ?? []
  return {
    scope: o.kind === "quantity_break" && o.productIds.length === 0 && colls.length ? "collection" : "product",
    tiers: (o.tiers ?? []).map((t) => tierDraftOf(t, currency)),
    kind: o.kind,
    title: o.title,
    productIds: o.productIds,
    condition: colls.length ? "collections" : o.triggerIds.length ? "products" : "any",
    triggerIds: o.triggerIds,
    triggerCollectionIds: colls,
    minSubtotal: o.minSubtotalCents ? amountOf(o.minSubtotalCents, currency) : "",
    discountType: o.discountType,
    amount: o.discountType === "fixed" ? amountOf(o.discountValue, currency) : o.discountType === "percent" ? String(o.discountValue) : "",
    placements: o.placements ?? [...PLACEMENTS_FOR[o.kind]],
    startsAt: localInput(o.startsAt),
    endsAt: localInput(o.endsAt),
    maxPerOrder: o.maxPerOrder ? String(o.maxPerOrder) : "",
    combinesWithCodes: o.combinesWithCodes !== false,
    active: o.active,
  }
}

/** The draft as the server reads it (app/api/store/offers, lib/offers readOffer). */
export function bodyOf(d: Draft, currency: string) {
  const checkout = d.kind === "checkout"
  if (d.kind === "quantity_break") {
    return {
      kind: d.kind,
      title: d.title,
      productIds: d.scope === "product" ? d.productIds.slice(0, 1) : [],
      triggerIds: [] as string[],
      triggerCollectionIds: d.scope === "collection" ? d.triggerCollectionIds.slice(0, 1) : [],
      minSubtotalCents: null as number | null,
      discountType: "none" as DiscountType,
      discountValue: 0,
      placements: d.placements,
      startsAt: fromInput(d.startsAt),
      endsAt: fromInput(d.endsAt),
      maxPerOrder: null as number | null,
      combinesWithCodes: d.combinesWithCodes,
      active: d.active,
      tiers: d.tiers.map((t) => tierOf(t, currency)),
    }
  }
  return {
    kind: d.kind,
    title: d.title,
    productIds: d.productIds,
    triggerIds: checkout && d.condition === "products" ? d.triggerIds : [],
    triggerCollectionIds: checkout && d.condition === "collections" ? d.triggerCollectionIds : [],
    minSubtotalCents: checkout && d.minSubtotal.trim() ? minorOf(d.minSubtotal, currency) : null,
    discountType: d.discountType,
    discountValue: d.discountType === "fixed" ? minorOf(d.amount, currency) : d.discountType === "percent" ? Math.round(Number(d.amount)) : 0,
    placements: d.placements,
    startsAt: fromInput(d.startsAt),
    endsAt: fromInput(d.endsAt),
    maxPerOrder: d.maxPerOrder.trim() ? Math.floor(Number(d.maxPerOrder)) : null,
    combinesWithCodes: d.combinesWithCodes,
    active: d.active,
  }
}

export type Problems = Partial<Record<"title" | "products" | "triggers" | "amount" | "minimum" | "places" | "dates" | "limit" | "tiers", string>> & { tier?: Record<number, string> }

/** What is wrong with a quantity break's tiers, each by its place (from 0), and for the list as a whole; lib/offers/pricing readTiers checks it all again. */
export function tierProblems(tiers: TierDraft[], currency: string): { each: Record<number, string>; all: string | null } {
  const each: Record<number, string> = {}
  const read = tiers.map((t) => tierOf(t, currency))
  read.forEach((t, i) => {
    if (!Number.isInteger(t.quantity) || t.quantity < 1 || t.quantity > MAX_TIER_QUANTITY) each[i] = tt("Buy 1 to {max}.", { max: MAX_TIER_QUANTITY })
    else if (!Number.isInteger(t.freeQuantity) || t.freeQuantity < 0 || t.freeQuantity > MAX_FREE_QUANTITY) each[i] = tt("Free is 0 to {max}.", { max: MAX_FREE_QUANTITY })
    else if (t.discountType === "percent" && (!Number.isInteger(t.discountValue) || t.discountValue < 0 || t.discountValue > MAX_TIER_PERCENT)) each[i] = tt("A percent off is 0 to {maxPercent}.", { maxPercent: MAX_TIER_PERCENT })
    else if (t.discountType === "amount" && (!Number.isFinite(t.discountValue) || t.discountValue < 0)) each[i] = tt("Enter the amount off.")
    else if (i > 0 && !each[i - 1] && (t.quantity + t.freeQuantity <= read[i - 1].quantity + read[i - 1].freeQuantity || t.quantity < read[i - 1].quantity)) each[i] = tt("Make it bigger than the tier above.")
  })
  const all = tiers.length === 0 ? tt("Add at least one tier.") : tiers.length > MAX_TIERS ? tt("Up to {max} tiers.", { max: MAX_TIERS }) : !read.some(tierDiscounts) ? tt("Give at least one tier a discount or free units.") : null
  return { each, all }
}

/** What is wrong with a draft, field by field, in plain words; the server checks it all again. */
export function problemsOf(d: Draft, currency: string): Problems {
  const out: Problems = {}
  if (!d.title.trim()) out.title = tt("Give it a name buyers will see, like “Complete the set”.")
  if (d.kind === "quantity_break") {
    if (d.scope === "product" && d.productIds.length !== 1) out.products = tt("Choose the product.")
    if (d.scope === "collection" && d.triggerCollectionIds.length !== 1) out.products = tt("Choose the collection.")
    const tiers = tierProblems(d.tiers, currency)
    if (Object.keys(tiers.each).length) out.tier = tiers.each
    if (tiers.all) out.tiers = tiers.all
    if (d.placements.length === 0) out.places = tt("Choose at least one place to show it.")
    const body = bodyOf(d, currency)
    if (body.startsAt && body.endsAt && Date.parse(body.endsAt) <= Date.parse(body.startsAt)) out.dates = tt("The end has to be after the start.")
    return out
  }
  if (d.kind === "bundle" && (d.productIds.length < 2 || d.productIds.length > MAX_BUNDLE)) out.products = tt("A bundle has 2 to {maxBundle} products.", { maxBundle: MAX_BUNDLE })
  if (d.kind === "checkout" && d.productIds.length !== 1) out.products = tt("Choose the product to offer.")
  if (d.kind === "checkout" && d.condition === "products" && d.triggerIds.length === 0) out.triggers = tt("Pick the products that show it, or choose Any order.")
  if (d.kind === "checkout" && d.condition === "collections" && d.triggerCollectionIds.length === 0) out.triggers = tt("Pick a collection, or choose Any order.")
  const body = bodyOf(d, currency)
  if (d.discountType === "percent" && (!Number.isFinite(body.discountValue) || body.discountValue < 1 || body.discountValue > MAX_PERCENT)) out.amount = tt("A percent off is 1 to {maxPercent}.", { maxPercent: MAX_PERCENT })
  if (d.discountType === "fixed" && (!Number.isFinite(body.discountValue) || body.discountValue < 1)) out.amount = tt("Enter the amount off.")
  if (body.minSubtotalCents !== null && (!Number.isFinite(body.minSubtotalCents) || body.minSubtotalCents < 0)) out.minimum = tt("Enter the order minimum as an amount.")
  if (d.placements.length === 0) out.places = tt("Choose at least one place to show it.")
  if (body.startsAt && body.endsAt && Date.parse(body.endsAt) <= Date.parse(body.startsAt)) out.dates = tt("The end has to be after the start.")
  if (body.maxPerOrder !== null && (!Number.isFinite(body.maxPerOrder) || body.maxPerOrder < 1 || body.maxPerOrder > MAX_PER_ORDER)) out.limit = tt("A limit per order is 1 to {max}.", { max: MAX_PER_ORDER })
  return out
}
