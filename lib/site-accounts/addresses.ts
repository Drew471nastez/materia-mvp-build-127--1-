import { randomUUID } from "node:crypto"
import { readAddress } from "@/lib/physical/address"
import { phoneForStorage } from "@/lib/account/phone"
import { COUNTRY_CODES } from "@/lib/checkout/countries"
import { regionCode } from "@/lib/physical/regions"
import { isMissingColumn, UUID, type Db } from "./db"

/**
 * ===========================================================================
 *  A CUSTOMER'S OWN ADDRESS BOOK, ON ONE CREATOR'S WEBSITE
 * ===========================================================================
 * What a shop's account page has under Addresses: the places the customer
 * has things sent, which they add, change and delete themselves, one of them
 * the default that checkout fills in. Kept on their row in `site_customers`
 * (`addresses`, a JSON list, supabase/sql/run-now/287), so it belongs to
 * this website's account and goes with it when the account is deleted.
 *
 * NEVER CHANGED YET. Until the customer touches the list (`addresses` is
 * NULL) the account shows the addresses their orders from this shop were
 * sent to (./account-data.ts customerAddresses), as before. The first change
 * starts the book from those, so nothing they saw disappears when they add
 * one. An empty list is a book they emptied, and stays empty.
 *
 * Every field goes through the checkout's own check (lib/physical/address
 * readAddress), so an address saved here is one checkout accepts as it is.
 * Pure but for the two reads and one write at the end; the routes pass the
 * customer's id and creator from the session, never from the form.
 */

export const MAX_ADDRESSES = 10

export interface SavedAddress {
  id: string
  name: string
  company: string | null
  line1: string
  line2: string | null
  city: string
  region: string | null
  postalCode: string | null
  /** ISO 3166 alpha-2, upper case. */
  country: string
  phone: string | null
  default: boolean
}

/** Why a save stopped, as a code a page turns into its own words (lib/markets/ui-words acct_err_*). */
export type AddressRefusal = "name" | "line1" | "city" | "country" | "postal" | "region" | "phone" | "full" | "missing" | "unavailable" | "failed"

const FIELD_REFUSAL: Record<string, AddressRefusal> = { name: "name", company: "name", line1: "line1", line2: "line1", city: "city", country: "country", postalCode: "postal", region: "region", phone: "phone" }

/** The address as typed in the account's form (or a theme's Shopify address form, mapped), checked as checkout checks it. */
export function cleanAddress(input: Record<string, unknown>): { ok: true; address: Omit<SavedAddress, "id" | "default"> } | { ok: false; why: AddressRefusal } {
  const checked = readAddress(
    {
      name: input.name,
      company: input.company,
      line1: input.line1,
      line2: input.line2,
      city: input.city,
      region: input.region,
      postalCode: input.postalCode,
      country: input.country,
      phone: input.phone,
    },
    { nameFields: "last_only", company: "optional", phone: "optional", address2: "optional" },
  )
  if (checked.ok === false) return { ok: false, why: FIELD_REFUSAL[checked.field] ?? "failed" }
  const a = checked.address
  /* "Texas" or "tx" kept as "TX": checkout's state list is by code (lib/physical/regions), so the default fills it in. */
  const region = a.region ? (regionCode(a.country, a.region) ?? a.region) : null
  return { ok: true, address: { name: a.name, company: a.company ?? null, line1: a.line1, line2: a.line2, city: a.city, region, postalCode: a.postalCode, country: a.country, phone: a.phone } }
}

/** One stored entry, read back defensively: a hand-edited or older row never breaks the page. Null when it is not an address. */
function readSaved(raw: unknown): SavedAddress | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(r.id) ? r.id : null
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "")
  const country = s(r.country, 2).toUpperCase()
  if (!id || !s(r.line1, 200) || !COUNTRY_CODES.has(country)) return null
  return {
    id,
    name: s(r.name, 120),
    company: s(r.company, 120) || null,
    line1: s(r.line1, 200),
    line2: s(r.line2, 200) || null,
    city: s(r.city, 120),
    region: s(r.region, 120) || null,
    postalCode: s(r.postalCode, 20) || null,
    country,
    phone: s(r.phone, 40) || null,
    default: r.default === true,
  }
}

/** The stored book as a list, at most MAX_ADDRESSES, with exactly one default when there is any. Null for a book never changed. */
export function readAddressBook(raw: unknown): SavedAddress[] | null {
  if (raw === null || raw === undefined) return null
  if (!Array.isArray(raw)) return null
  return withOneDefault(raw.map(readSaved).filter((a): a is SavedAddress => !!a).slice(0, MAX_ADDRESSES))
}

function withOneDefault(list: SavedAddress[]): SavedAddress[] {
  if (list.length === 0) return list
  const at = Math.max(0, list.findIndex((a) => a.default))
  return list.map((a, i) => (a.default === (i === at) ? a : { ...a, default: i === at }))
}

/** The default address first, then the rest as they were added: the order a shop's account lists them in. */
export function inBookOrder(list: SavedAddress[]): SavedAddress[] {
  return [...list.filter((a) => a.default), ...list.filter((a) => !a.default)]
}

/** An address a past checkout stored (lib/physical/checkout-server), as an entry of the book. */
export function fromCheckout(raw: unknown, index: number): SavedAddress | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const cleaned = cleanAddress(raw as Record<string, unknown>)
  if (cleaned.ok === false) {
    /* An address from before a check existed still shows, as long as it names a street and a real country. */
    const loose = readSaved({ ...(raw as Record<string, unknown>), id: `o${index + 1}` })
    return loose ? { ...loose, default: index === 0 } : null
  }
  return { ...cleaned.address, id: `o${index + 1}`, default: index === 0 }
}

export type BookChange =
  | { kind: "save"; id: string | null; fields: Record<string, unknown>; makeDefault: boolean }
  | { kind: "delete"; id: string }
  | { kind: "default"; id: string }

export type BookResult = { ok: true; book: SavedAddress[]; id: string | null } | { ok: false; why: AddressRefusal }

/**
 * The book after one change. `id` null adds; an id that is not in the book
 * is `missing` (deleted in another tab, say), never a new entry under a
 * name the form chose. The first address is the default; deleting the
 * default makes the next one the default.
 */
export function changeBook(book: SavedAddress[], change: BookChange, newId: () => string = () => randomUUID()): BookResult {
  if (change.kind === "delete") {
    if (!book.some((a) => a.id === change.id)) return { ok: false, why: "missing" }
    return { ok: true, book: withOneDefault(book.filter((a) => a.id !== change.id)), id: null }
  }
  if (change.kind === "default") {
    if (!book.some((a) => a.id === change.id)) return { ok: false, why: "missing" }
    return { ok: true, book: book.map((a) => ({ ...a, default: a.id === change.id })), id: change.id }
  }
  const cleaned = cleanAddress(change.fields)
  if (cleaned.ok === false) return cleaned
  if (change.id) {
    const at = book.findIndex((a) => a.id === change.id)
    if (at < 0) return { ok: false, why: "missing" }
    const next = book.map((a, i) => (i === at ? { ...cleaned.address, id: a.id, default: a.default } : a))
    return { ok: true, book: change.makeDefault ? next.map((a) => ({ ...a, default: a.id === change.id })) : next, id: change.id }
  }
  if (book.length >= MAX_ADDRESSES) return { ok: false, why: "full" }
  const id = newId()
  const added: SavedAddress = { ...cleaned.address, id, default: book.length === 0 || change.makeDefault }
  const next = [...(added.default ? book.map((a) => ({ ...a, default: false })) : book), added]
  return { ok: true, book: next, id }
}

/* ─── The database half ─────────────────────────────────────────────────── */

/** The stored book (null when never changed), or `unavailable` before part 287 has run. */
export async function storedBook(db: Db, scope: { customerId: string; creatorId: string }): Promise<{ ok: true; book: SavedAddress[] | null } | { ok: false; why: "unavailable" | "failed" }> {
  if (!UUID.test(scope.customerId) || !UUID.test(scope.creatorId)) return { ok: false, why: "failed" }
  try {
    const { data, error } = await db.from("site_customers").select("addresses").eq("id", scope.customerId).eq("creator_id", scope.creatorId).maybeSingle()
    if (error) return { ok: false, why: isMissingColumn(error) ? "unavailable" : "failed" }
    if (!data) return { ok: false, why: "failed" }
    return { ok: true, book: readAddressBook((data as { addresses?: unknown }).addresses) }
  } catch {
    return { ok: false, why: "failed" }
  }
}

/**
 * One change to the customer's own book, and nobody else's. A book never
 * changed starts from `seed`, the addresses their orders went to, so the
 * list they were looking at is the list they change.
 */
export async function updateBook(db: Db, scope: { customerId: string; creatorId: string }, change: BookChange, seed: () => Promise<SavedAddress[]>): Promise<BookResult> {
  const read = await storedBook(db, scope)
  if (read.ok === false) return read
  const start = read.book ?? (await seed().catch(() => [] as SavedAddress[]))
  /* Ids the seed made up (o1, o2) are kept: the page the customer pressed Edit on named them. */
  const changed = changeBook(start, change)
  if (changed.ok === false) return changed
  try {
    const { data, error } = await db.from("site_customers").update({ addresses: changed.book }).eq("id", scope.customerId).eq("creator_id", scope.creatorId).select("id")
    if (error) return { ok: false, why: isMissingColumn(error) ? "unavailable" : "failed" }
    return Array.isArray(data) && data.length === 1 ? changed : { ok: false, why: "failed" }
  } catch {
    return { ok: false, why: "failed" }
  }
}

/** A phone number as a customer typed it on their profile: E.164 when it has its country code, else as typed. Empty clears it; null is refused. */
export function cleanPhone(value: unknown): string | null {
  if (typeof value !== "string") return null
  // eslint-disable-next-line no-control-regex
  const typed = value.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim()
  if (!typed) return ""
  if (typed.length > 40) return null
  return phoneForStorage(typed)
}
