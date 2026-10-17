import "server-only"

/**
 * ===========================================================================
 *  A STORE'S OWN CHECKOUT WORDS, READ AND WRITTEN BY THE SERVER
 * ===========================================================================
 * checkout_text_overrides (SQL part 212): one row per store, language and
 * registry id (./registry.ts). Read when a checkout, its thank you page or a
 * buyer's email is drawn; written only by /api/store/checkout-text after the
 * owner check and validateOverride. A store that has not run part 212 reads
 * as having none, so the checkout never fails over it.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { editableById, validateOverride } from "./registry"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface OverrideRow {
  textId: string
  value: string
  defaultText: string
  updatedAt: string | null
}

/** The table is not there yet (part 212 not run). */
export function overridesMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204" || /checkout_text_overrides/.test(error.message ?? ""))
}

const lc = (s: string) => s.trim().toLowerCase()

/** One language's rows for a store, as stored. `ready` false when part 212 has not run. */
export async function readOverrideRows(db: Db, creatorId: string, locale: string): Promise<{ ready: boolean; rows: OverrideRow[] }> {
  try {
    const { data, error } = await db.from("checkout_text_overrides").select("text_id, value, default_text, updated_at").eq("creator_id", creatorId).eq("locale", lc(locale))
    if (error) return { ready: !overridesMissing(error), rows: [] }
    return {
      ready: true,
      rows: ((data ?? []) as { text_id: string; value: string; default_text: string | null; updated_at: string | null }[]).map((r) => ({ textId: r.text_id, value: r.value, defaultText: r.default_text ?? "", updatedAt: r.updated_at })),
    }
  } catch {
    return { ready: false, rows: [] }
  }
}

/**
 * The store's words for a language, by the English sentence each replaces,
 * ready to lay over the checkout's (./words.ts layeredWords). Checked again
 * on the way out: a row written by an older rule, or for an id the registry
 * no longer lists, is left out rather than drawn.
 */
export async function checkoutOverrides(creatorId: string, locale: string, db: Db = createAdminClient()): Promise<Record<string, string>> {
  const { rows } = await readOverrideRows(db, creatorId, locale)
  const out: Record<string, string> = {}
  for (const r of rows) {
    const entry = editableById(r.textId)
    if (!entry) continue
    const checked = validateOverride(entry, r.value)
    if (checked.ok && checked.text) out[entry.source] = checked.text
  }
  return out
}

/** Saves (or, for an empty text, removes) one override. The caller has checked the owner and the text. */
export async function writeOverride(db: Db, creatorId: string, locale: string, textId: string, value: string | null, defaultText: string, userId: string | null): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const table = db.from("checkout_text_overrides")
  const { error } = value
    ? await table.upsert({ creator_id: creatorId, locale: lc(locale), text_id: textId, value, default_text: defaultText.slice(0, 400), updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "creator_id,locale,text_id" })
    : await table.delete().eq("creator_id", creatorId).eq("locale", lc(locale)).eq("text_id", textId)
  if (!error) return { ok: true }
  if (overridesMissing(error)) return { ok: false, status: 503, error: "Checkout text needs its database update (SQL part 212). Until it runs, checkout shows Storelib's words." }
  console.error(`[checkout-text] save: ${error.code ?? ""}`)
  return { ok: false, status: 500, error: "That couldn't be saved. Try again." }
}
