import "server-only"

/**
 * A store's own words for its customer emails (lib/emails/customer-custom.ts),
 * read and written. `store_settings.customer_emails` (SQL part 129), always
 * filtered by the creator id the caller proved. Reads fail open: any error,
 * a database without the column included, and every email goes out with its
 * default words, never not at all.
 */
import { COMMUNITY_EXTRAS_KEY } from "./community-words"
import { isCopyLanguage, readCopy, readSavedCopy, withWords, type CustomerEmailsCopy } from "./customer-custom"

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

/**
 * One email's words saved (or put back to the default with `copy: null`);
 * the whole set back. `lang` is one of the website's other languages: the
 * words for buyers who read it in that one, the main words left as they are.
 */
export async function saveCustomerEmailCopy(db: Db, creatorId: string, id: unknown, input: unknown, lang: unknown = null): Promise<{ ok: true; copy: CustomerEmailsCopy } | { ok: false; error: string; status: number }> {
  if (typeof id !== "string") return { ok: false, error: "That email can't be changed.", status: 400 }
  if (lang !== null && lang !== undefined && !isCopyLanguage(lang)) return { ok: false, error: "That language can't be saved.", status: 400 }
  const read = input === null ? ({ ok: true, copy: null } as const) : readCopy(id, input)
  if (read.ok === false) return { ok: false, error: read.error, status: 400 }
  const { data, error } = await db.from("store_settings").select("customer_emails").eq("creator_id", creatorId).maybeSingle()
  if (error) return { ok: false, error: MISSING.has(error.code) ? EMAILS_NEED_PART : "That could not be saved. Try again in a moment.", status: MISSING.has(error.code) ? 409 : 500 }
  const next = readSavedCopy(data?.customer_emails)
  const merged = withWords(next[id], read.copy, typeof lang === "string" ? lang : null)
  if (merged) next[id] = merged
  else delete next[id]
  /* A community's preview text and footer note live beside these words (lib/emails/community-words.ts COMMUNITY_EXTRAS_KEY): kept as they are. */
  const extras = data?.customer_emails && typeof data.customer_emails === "object" ? (data.customer_emails as Record<string, unknown>)[COMMUNITY_EXTRAS_KEY] : undefined
  const { error: saveError } = await db.from("store_settings").upsert({ creator_id: creatorId, customer_emails: extras ? { ...next, [COMMUNITY_EXTRAS_KEY]: extras } : next, updated_at: new Date().toISOString() }, { onConflict: "creator_id" })
  if (saveError) return { ok: false, error: MISSING.has(saveError.code) ? EMAILS_NEED_PART : "That could not be saved. Try again in a moment.", status: MISSING.has(saveError.code) ? 409 : 500 }
  return { ok: true, copy: next }
}

/**
 * WHERE A BUYER'S REPLY GOES: the contact email from Settings › Store details
 * (store_settings.contact_email, SQL part 118), the address the emails show
 * in their footer, so the header and the footer never disagree. Null when
 * the store has none, or it is not a plain address, or it is one of
 * Storelib's relay addresses: the caller keeps its own.
 */
export async function storeContactEmail(db: Db, creatorId: string | null | undefined): Promise<string | null> {
  if (!creatorId) return null
  try {
    const { data, error } = await db.from("store_settings").select("contact_email").eq("creator_id", creatorId).maybeSingle()
    if (error) return null
    return replyAddress(data?.contact_email)
  } catch {
    return null
  }
}

/** A plain address fit for a Reply-To header, or null: one line, one @, no relay (+slb-). */
export function replyAddress(value: unknown): string | null {
  if (typeof value !== "string") return null
  const v = value.trim().toLowerCase()
  if (!v || v.length > 254 || /\+slb-/i.test(v)) return null
  return /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(v) ? v : null
}
