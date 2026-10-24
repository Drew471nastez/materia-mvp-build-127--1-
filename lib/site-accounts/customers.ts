import { randomUUID } from "node:crypto"
import { isMissingColumn, isMissingTable, UUID, type Db } from "./db"

/**
 * ===========================================================================
 *  A CUSTOMER OF ONE CREATOR'S WEBSITE
 * ===========================================================================
 * What Shopify calls a customer account: somebody who signed in on a shop,
 * known to that shop by their email. One row in `site_customers` per creator
 * and email (unique), made the first time a code sent to that email is typed
 * back on the website. Nothing else is made: no Supabase user, no profile,
 * no creator row, no Storelib login. The same person on another creator's
 * website is another customer there, the way two shops are two accounts.
 *
 * Written by the server only, with the key that skips row level security,
 * so the scoping here is the access control: every read and write names the
 * customer's id AND the creator, and neither ever comes from the request.
 */

const CUSTOMERS = "site_customers"

export interface CustomerRow {
  id: string
  creator_id: string
  email: string
  name: string | null
  created_at: string | null
  /** What they typed on their profile (supabase/sql/run-now/287); absent before that part has run. */
  phone?: string | null
  /** Their own address book (./addresses.ts), NULL while never changed; absent before part 287. */
  addresses?: unknown
}

export type CustomerResult =
  | { ok: true; customer: CustomerRow; created: boolean }
  | { ok: false; why: "unavailable" | "failed" }

const COLUMNS = "id, creator_id, email, name, created_at"
/* With the profile's phone and the address book (part 287). A database without them is read with COLUMNS: a missing column must never sign everybody out. */
const FULL_COLUMNS = `${COLUMNS}, phone, addresses`

/** The customer for this email on this creator's website, made now if there is none. */
export async function findOrCreateCustomer(
  db: Db,
  input: { creatorId: string; email: string },
  now = Date.now(),
): Promise<CustomerResult> {
  if (!UUID.test(input.creatorId) || !input.email) return { ok: false, why: "failed" }
  const at = new Date(now).toISOString()
  const find = async () => db.from(CUSTOMERS).select(COLUMNS).eq("creator_id", input.creatorId).eq("email", input.email).maybeSingle()
  try {
    const found = await find()
    if (found.error) return { ok: false, why: isMissingTable(found.error) ? "unavailable" : "failed" }
    if (found.data) {
      const customer = found.data as CustomerRow
      await db.from(CUSTOMERS).update({ last_sign_in_at: at }).eq("id", customer.id).eq("creator_id", input.creatorId)
      return { ok: true, customer, created: false }
    }
    const row = { id: randomUUID(), creator_id: input.creatorId, email: input.email, name: null, created_at: at, last_sign_in_at: at }
    const made = await db.from(CUSTOMERS).insert(row)
    if (!made.error) return { ok: true, customer: { id: row.id, creator_id: row.creator_id, email: row.email, name: null, created_at: at }, created: true }
    /* 23505: the same email signed in twice at once, and the other one made it. */
    if (made.error.code === "23505") {
      const again = await find()
      if (again.data) return { ok: true, customer: again.data as CustomerRow, created: false }
    }
    return { ok: false, why: isMissingTable(made.error) ? "unavailable" : "failed" }
  } catch {
    return { ok: false, why: "failed" }
  }
}

/** The signed-in customer's row, only for the creator the session names. Null when gone or unreadable. */
export async function customerById(db: Db, scope: { customerId: string; creatorId: string }): Promise<CustomerRow | null> {
  if (!UUID.test(scope.customerId) || !UUID.test(scope.creatorId)) return null
  try {
    const full = await db.from(CUSTOMERS).select(FULL_COLUMNS).eq("id", scope.customerId).eq("creator_id", scope.creatorId).maybeSingle()
    if (!full.error) return (full.data as CustomerRow | null) ?? null
    if (!isMissingColumn(full.error)) return null
    const { data, error } = await db.from(CUSTOMERS).select(COLUMNS).eq("id", scope.customerId).eq("creator_id", scope.creatorId).maybeSingle()
    if (error || !data) return null
    return data as CustomerRow
  } catch {
    return null
  }
}

/** A name as a customer typed it: one line, no control characters, at most 120 characters. Empty clears it. */
export function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null
  // eslint-disable-next-line no-control-regex
  const name = value.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim()
  if (name.length > 120) return null
  return name
}

/** Changes the customer's own name, and nobody else's. */
export async function renameCustomer(db: Db, scope: { customerId: string; creatorId: string }, name: string): Promise<boolean> {
  if (!UUID.test(scope.customerId) || !UUID.test(scope.creatorId)) return false
  try {
    const { data, error } = await db
      .from(CUSTOMERS)
      .update({ name: name || null })
      .eq("id", scope.customerId)
      .eq("creator_id", scope.creatorId)
      .select("id")
    return !error && Array.isArray(data) && data.length === 1
  } catch {
    return false
  }
}

/** Changes the customer's own phone number ("" clears it). False before part 287 has run, or when nothing changed. */
export async function setCustomerPhone(db: Db, scope: { customerId: string; creatorId: string }, phone: string): Promise<boolean> {
  if (!UUID.test(scope.customerId) || !UUID.test(scope.creatorId)) return false
  try {
    const { data, error } = await db
      .from(CUSTOMERS)
      .update({ phone: phone || null })
      .eq("id", scope.customerId)
      .eq("creator_id", scope.creatorId)
      .select("id")
    return !error && Array.isArray(data) && data.length === 1
  } catch {
    return false
  }
}

/**
 * DELETES THE CUSTOMER'S OWN ACCOUNT ON THIS WEBSITE, and nothing else. The
 * row goes, and with it what they saved (site_customer_wishlist cascades)
 * and any sign in code still waiting for their email here. Their orders stay
 * with the creator, the way a shop keeps its sales records when a customer
 * closes their account: the receipts were sent to the email, not to the
 * account. Signing in again with the same email makes a new, empty account.
 */
export async function deleteCustomer(db: Db, scope: { customerId: string; creatorId: string }): Promise<boolean> {
  if (!UUID.test(scope.customerId) || !UUID.test(scope.creatorId)) return false
  try {
    const found = await customerById(db, scope)
    if (!found) return false
    /* Also gone by the foreign key's cascade; said here too, so it never rests on that alone. */
    await db.from("site_customer_wishlist").delete().eq("customer_id", scope.customerId)
    const { data, error } = await db.from(CUSTOMERS).delete().eq("id", scope.customerId).eq("creator_id", scope.creatorId).select("id")
    if (error || !Array.isArray(data) || data.length !== 1) return false
    await db.from("site_customer_codes").delete().eq("creator_id", scope.creatorId).eq("email", found.email)
    return true
  } catch {
    return false
  }
}
