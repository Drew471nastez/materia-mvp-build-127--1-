/**
 * ===========================================================================
 *  RETURN AND REFUND REASONS
 * ===========================================================================
 * A store's own list of why things come back (Settings › Returns and
 * refunds, commerce_reasons, SQL part 109). Each reason is a short value,
 * kept on the return or the refund, and a label people see:
 *
 *   return   picked by the buyer asking for a return, and by the shop
 *            opening one for them (physical products)
 *   refund   picked by the shop when it refunds, any product
 *
 * Until a store changes anything it has the lists below, which are the
 * values Storelib always used, so every return and refund made before this
 * still reads with its label. "other" is always there, and is where an
 * unknown value lands, so nothing is ever turned away for its reason.
 *
 * Pure, so the pages, the server and the tests share it.
 */

export type ReasonKind = "return" | "refund"

export interface Reason {
  id?: string
  value: string
  label: string
  description: string | null
}

export const DEFAULT_RETURN_REASONS: Reason[] = [
  { value: "size", label: "Size or fit", description: "Too small, too big, or didn't fit as expected." },
  { value: "damaged", label: "Arrived damaged", description: "Broken or marked when it arrived." },
  { value: "defective", label: "Doesn't work", description: "Faulty, or stopped working." },
  { value: "not_as_described", label: "Not as described", description: "Different from the photos or the description." },
  { value: "wrong_item", label: "Wrong item", description: "A different product, size or color was sent." },
  { value: "changed_mind", label: "Changed my mind", description: "No longer wanted." },
  { value: "other", label: "Other", description: null },
]

/* requested_by_customer, duplicate and fraudulent are the three a card network knows; the rest are told to it as the first. */
export const DEFAULT_REFUND_REASONS: Reason[] = [
  { value: "requested_by_customer", label: "The buyer asked for it", description: null },
  { value: "returned", label: "Items returned", description: "Refunding a return that came back." },
  { value: "cancelled", label: "Order cancelled", description: "Cancelled before it was sent or delivered." },
  { value: "damaged_in_transit", label: "Damaged in delivery", description: null },
  { value: "not_received", label: "Never arrived", description: null },
  { value: "duplicate", label: "Charged twice", description: null },
  { value: "fraudulent", label: "Fraudulent", description: "A payment the card's owner didn't make." },
  { value: "other", label: "Something else", description: null },
]

export const defaultsFor = (kind: ReasonKind): Reason[] => (kind === "return" ? DEFAULT_RETURN_REASONS : DEFAULT_REFUND_REASONS)

/** The fallback that is always on the list. */
export const FALLBACK_REASON = "other"
export const MAX_REASONS = 30

export const isReasonValue = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9_]{1,40}$/.test(v)

/** "Too big, sent back" → "too_big_sent_back": the value a typed label is kept as. */
export function valueFromLabel(label: string): string {
  const v = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/g, "")
  return v || "reason"
}

/** A value not already taken in this list: "size", then "size_2". */
export function freeValue(wanted: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(wanted)) return wanted
  for (let n = 2; n < 1000; n++) {
    const next = `${wanted.slice(0, 36)}_${n}`
    if (!used.has(next)) return next
  }
  return `${wanted.slice(0, 30)}_${Date.now().toString(36).slice(-8)}`
}

/** The label for a stored value: the store's own, else Storelib's, else the value written out. */
export function reasonLabel(value: string | null | undefined, kind: ReasonKind, list?: readonly Reason[] | null): string {
  if (!value) return ""
  const own = list?.find((r) => r.value === value)
  if (own) return own.label
  const known = defaultsFor(kind).find((r) => r.value === value)
  if (known) return known.label
  const words = value.replace(/_/g, " ").trim()
  return words ? words[0].toUpperCase() + words.slice(1) : value
}

/** A value a buyer or the shop sent, kept only when it is on the store's list; otherwise "other". */
export function acceptedReason(sent: unknown, list: readonly Reason[]): string {
  return isReasonValue(sent) && list.some((r) => r.value === sent) ? sent : FALLBACK_REASON
}

/** What a reason form sent, checked: a label of 1 to 60 characters, a description up to 200. */
export function readReason(input: unknown): { ok: true; label: string; description: string | null } | { ok: false; error: string } {
  const body = (input ?? {}) as Record<string, unknown>
  const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max) : "")
  const label = clean(body.label, 60)
  if (!label) return { ok: false, error: "Give the reason a name." }
  const description = clean(body.description, 200) || null
  return { ok: true, label, description }
}
