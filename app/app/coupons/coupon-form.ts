/**
 * ===========================================================================
 *  A COUPON'S FORM, WITHOUT THE PAGE
 * ===========================================================================
 * What the coupon editor (./coupon-editor.tsx) holds while it is being
 * filled in, how a saved code is read into it, the first thing wrong with it
 * (and which field that is, so the page can point at it), the body it sends,
 * and the plain summary shown beside it on a computer. Pure, so the tests
 * run it as it is (tests/coupon-editor.test.ts).
 *
 * The server checks everything again (lib/checkout/coupons.ts,
 * readCouponInput), and that check is the one that counts. This one only
 * answers sooner, next to the field it is about.
 */
import { CODE_PATTERN } from "@/lib/checkout/coupon-state"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"

export interface CouponRecord {
  id: string
  code: string
  discount_type: "percentage" | "fixed"
  discount_value: number
  product_ids: string[] | null
  usage_limit: number | null
  usage_count?: number
  starts_at: string | null
  expires_at: string | null
  min_purchase_cents?: number | null
  is_active: boolean
  created_at?: string
  creator_id?: string
  /* Physical commerce (lib/physical): absent before SQL part 78. */
  free_shipping?: boolean
  physical_only?: boolean
  per_customer_limit?: number | null
  collection_ids?: string[] | null
}

export interface CouponProduct {
  id: string
  title: string
  price_cents: number
  thumbnail_url: string | null
  status: string
}

export interface CouponForm {
  code: string
  discount_type: "percentage" | "fixed"
  discount_value: string
  applies_to: "all" | "specific"
  product_ids: string[]
  has_min_purchase: boolean
  min_purchase_amount: string
  has_usage_limit: boolean
  usage_limit: string
  has_start: boolean
  starts_at: string
  has_end: boolean
  expires_at: string
  is_active: boolean
}

export const emptyForm = (): CouponForm => ({
  code: "",
  discount_type: "percentage",
  discount_value: "",
  applies_to: "all",
  product_ids: [],
  has_min_purchase: false,
  min_purchase_amount: "",
  has_usage_limit: false,
  usage_limit: "",
  has_start: false,
  starts_at: "",
  has_end: false,
  expires_at: "",
  is_active: true,
})

/** A datetime-local field's value: "YYYY-MM-DDTHH:mm" in the viewer's own time. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** An amount in dollars as the field shows it: "5" for 5, "5.50" for 5.5. */
function dollars(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

export function fromCoupon(c: CouponRecord): CouponForm {
  const value = Number(c.discount_value)
  return {
    code: c.code,
    discount_type: c.discount_type,
    discount_value: c.discount_type === "fixed" ? dollars(value) : String(value),
    applies_to: c.product_ids && c.product_ids.length > 0 ? "specific" : "all",
    product_ids: c.product_ids ?? [],
    has_min_purchase: !!c.min_purchase_cents,
    min_purchase_amount: c.min_purchase_cents ? dollars(c.min_purchase_cents / 100) : "",
    has_usage_limit: c.usage_limit !== null && c.usage_limit !== undefined,
    usage_limit: c.usage_limit !== null && c.usage_limit !== undefined ? String(c.usage_limit) : "",
    has_start: !!c.starts_at,
    starts_at: toLocalInput(c.starts_at),
    has_end: !!c.expires_at,
    expires_at: toLocalInput(c.expires_at),
    is_active: c.is_active,
  }
}

/** What a field may hold while it is typed in. */
export const typedCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32)
/** Digits and one point, at most two places after it. */
export const typedAmount = (raw: string) => {
  const clean = raw.replace(/,/g, ".").replace(/[^0-9.]/g, "")
  const [whole, ...rest] = clean.split(".")
  return rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole
}
export const typedWhole = (raw: string) => raw.replace(/[^0-9]/g, "").slice(0, 7)

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
/**
 * A code nobody has to think up: eight capitals and digits, none of the
 * ones that are read as each other (0 and O, 1 and I).
 */
export function generateCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return Array.from(random(8), (b) => ALPHABET[b % ALPHABET.length]).join("")
}

export type CouponField = "code" | "value" | "products" | "minimum" | "uses" | "start" | "end"
export type CouponProblem = { field: CouponField; message: string }

/**
 * The first thing wrong with the form, in the order the page reads, or null.
 * `savedCode` is the code as it was saved: a code from before today's rules
 * is kept as it is (the server does the same).
 */
export function formProblem(form: CouponForm, savedCode: string | null = null, freeShipping = false): CouponProblem | null {
  if (!form.code) return { field: "code", message: tt("Enter a code, or generate one.") }
  if (!CODE_PATTERN.test(form.code) && form.code !== savedCode) return { field: "code", message: tt("A code is 3 to 32 letters, numbers, - or _.") }
  const value = Number(form.discount_value)
  /* A free shipping code (physical commerce) may take nothing else off. */
  const shippingOnly = freeShipping && (!form.discount_value || value === 0)
  if (!shippingOnly && (!form.discount_value || !Number.isFinite(value) || !(value > 0))) return { field: "value", message: tt("Enter how much it takes off.") }
  if (form.discount_type === "percentage" && value > 100) return { field: "value", message: tt("A percentage is at most 100.") }
  if (form.discount_type === "fixed" && value > 100_000) return { field: "value", message: tt("A fixed amount is at most $100,000.") }
  if (form.applies_to === "specific" && form.product_ids.length === 0) return { field: "products", message: tt("Pick at least one product.") }
  if (form.has_min_purchase && !(Number(form.min_purchase_amount) > 0)) return { field: "minimum", message: tt("Enter the smallest order it works on.") }
  if (form.has_usage_limit) {
    const n = Number(form.usage_limit)
    if (!form.usage_limit || !Number.isInteger(n) || n < 1) return { field: "uses", message: tt("Enter how many times it can be used.") }
  }
  if (form.has_start && !validLocal(form.starts_at)) return { field: "start", message: tt("Pick when it starts.") }
  if (form.has_end && !validLocal(form.expires_at)) return { field: "end", message: tt("Pick when it ends.") }
  if (form.has_start && form.has_end && new Date(form.expires_at) <= new Date(form.starts_at)) {
    return { field: "end", message: tt("The end has to be after the start.") }
  }
  return null
}

const validLocal = (v: string) => !!v && !Number.isNaN(new Date(v).getTime())

/** The body the create and edit routes take (app/api/coupons). */
export function formPayload(form: CouponForm) {
  return {
    code: form.code,
    discount_type: form.discount_type,
    discount_value: Number(form.discount_value),
    product_ids: form.applies_to === "specific" ? form.product_ids : null,
    usage_limit: form.has_usage_limit && form.usage_limit ? Number(form.usage_limit) : null,
    min_purchase_cents: form.has_min_purchase && form.min_purchase_amount ? Math.round(Number(form.min_purchase_amount) * 100) : null,
    starts_at: form.has_start && form.starts_at ? new Date(form.starts_at).toISOString() : null,
    expires_at: form.has_end && form.expires_at ? new Date(form.expires_at).toISOString() : null,
    is_active: form.is_active,
  }
}

const money = (value: number) => `$${Number.isInteger(value) ? value : value.toFixed(2)}`
const when = (local: string) =>
  new Date(local).toLocaleString(appLocale(), zoned({ month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }))

/**
 * The code in plain lines, as a buyer would meet it: what it takes off and
 * on what, then each rule it has. Only what is set; nothing for a rule that
 * is off. A value not typed yet is left out rather than guessed.
 */
export function summaryLines(form: CouponForm, products: Pick<CouponProduct, "id" | "title">[]): string[] {
  const lines: string[] = []
  const value = Number(form.discount_value)
  const on =
    form.applies_to === "all"
      ? tt("all products")
      : form.product_ids.length === 1
        ? products.find((p) => p.id === form.product_ids[0])?.title ?? tt("1 product")
        : tt("{length} products", { length: form.product_ids.length })
  if (form.discount_value && value > 0) {
    lines.push(`${form.discount_type === "percentage" ? `${value}%` : money(value)} off ${on}`)
  } else {
    lines.push(`Applies to ${on}`)
  }
  if (form.has_min_purchase && Number(form.min_purchase_amount) > 0) lines.push(`Orders of ${money(Number(form.min_purchase_amount))} or more`)
  if (form.has_usage_limit && Number(form.usage_limit) >= 1) {
    const n = Number(form.usage_limit)
    lines.push(n === 1 ? "Can be used once" : `Can be used ${n.toLocaleString(appLocale())} times`)
  }
  if (form.has_start && validLocal(form.starts_at)) lines.push(`Starts ${when(form.starts_at)}`)
  if (form.has_end && validLocal(form.expires_at)) lines.push(`Ends ${when(form.expires_at)}`)
  if (!form.has_end) lines.push("No end date")
  return lines
}

/**
 * What the editor did, handed to the list on the way back
 * (./list-return.ts): the row as saved, or the id that is gone, and a line
 * to say.
 */
export type CouponReturn = {
  /** The coupon the editor had open, if it was ever saved. */
  id: string | null
  /** The row as saved, to lay over the list the router kept. */
  saved?: CouponRecord | null
  /** It was deleted. */
  deleted?: boolean
  /** What the list says as it comes back. */
  message?: string
}

/** Lay what the editor did over the rows the router kept: a saved row replaced or added first, a deleted one gone. */
export function withReturn<T extends { id: string }>(rows: T[], what: CouponReturn | null): T[] {
  if (!what?.id) return rows
  if (what.deleted) return rows.filter((r) => r.id !== what.id)
  if (!what.saved) return rows
  const saved = what.saved as unknown as T
  return rows.some((r) => r.id === what.id) ? rows.map((r) => (r.id === what.id ? { ...r, ...saved } : r)) : [saved, ...rows]
}
