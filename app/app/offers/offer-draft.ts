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
import { minorDigits } from "./offer-money"

export type Condition = "any" | "products" | "collections"

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
    return { kind, title: kind === "bundle" ? tt("Buy it together") : tt("Add to your order"), productIds: [], condition: "any", triggerIds: [], triggerCollectionIds: [], minSubtotal: "", discountType: "percent", amount: "10", placements: [...PLACEMENTS_FOR[kind]], startsAt: "", endsAt: "", maxPerOrder: "", combinesWithCodes: true, active: true }
  }
  const colls = o.triggerCollectionIds ?? []
  return {
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

export type Problems = Partial<Record<"title" | "products" | "triggers" | "amount" | "minimum" | "places" | "dates" | "limit", string>>

/** What is wrong with a draft, field by field, in plain words; the server checks it all again. */
export function problemsOf(d: Draft, currency: string): Problems {
  const out: Problems = {}
  if (!d.title.trim()) out.title = tt("Give it a name buyers will see, like “Complete the set”.")
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
