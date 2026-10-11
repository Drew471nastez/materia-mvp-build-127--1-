import "server-only"

/**
 * A store's own words for its customer emails (lib/emails/customer-custom.ts),
 * read and written. `store_settings.customer_emails` (SQL part 129), always
 * filtered by the creator id the caller proved. Reads fail open: any error,
 * a database without the column included, and every email goes out with its
 * default words, never not at all.
 */
import { readCopy, readSavedCopy, type CustomerEmailsCopy } from "./customer-custom"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const MISSING = new Set(["42P01", "42703", "PGRST204", "PGRST205"])
export const EMAILS_NEED_PART = "Email changes need their database update. Run SQL part 129 in Supabase, then try again."

export async function loadCustomerEmailCopy(db: Db, creatorId: string | null | undefined): Promise<CustomerEmailsCopy> {
  if (!creatorId) return {}
  try {
    const { data, error } = await db.from("store_settings").select("customer_emails").eq("creator_id", creatorId).maybeSingle()
    if (error) return {}
    return readSavedCopy(data?.customer_emails)
  } catch {
    return {}
  }
}

/** Whether the column is there (SQL part 129), for Settings to say so. */
export async function customerEmailCopyReady(db: Db, creatorId: string): Promise<boolean> {
  const { error } = await db.from("store_settings").select("customer_emails").eq("creator_id", creatorId).maybeSingle()
  return !(error && MISSING.has(error.code))
}

/** One email's words saved (or put back to the default with `copy: null`); the whole set back. */
export async function saveCustomerEmailCopy(db: Db, creatorId: string, id: unknown, input: unknown): Promise<{ ok: true; copy: CustomerEmailsCopy } | { ok: false; error: string; status: number }> {
  if (typeof id !== "string") return { ok: false, error: "That email can't be changed.", status: 400 }
  const read = input === null ? ({ ok: true, copy: null } as const) : readCopy(id, input)
  if (read.ok === false) return { ok: false, error: read.error, status: 400 }
  const { data, error } = await db.from("store_settings").select("customer_emails").eq("creator_id", creatorId).maybeSingle()
  if (error) return { ok: false, error: MISSING.has(error.code) ? EMAILS_NEED_PART : "That could not be saved. Try again in a moment.", status: MISSING.has(error.code) ? 409 : 500 }
  const next = readSavedCopy(data?.customer_emails)
  if (read.copy) next[id] = read.copy
  else delete next[id]
  const { error: saveError } = await db.from("store_settings").upsert({ creator_id: creatorId, customer_emails: next, updated_at: new Date().toISOString() }, { onConflict: "creator_id" })
  if (saveError) return { ok: false, error: MISSING.has(saveError.code) ? EMAILS_NEED_PART : "That could not be saved. Try again in a moment.", status: MISSING.has(saveError.code) ? 409 : 500 }
  return { ok: true, copy: next }
}
