/**
 * ===========================================================================
 *  ARCHIVE AND RESTORE, AS SHOPIFY DOES THEM
 * ===========================================================================
 * A product has a `status` (draft, published, archived) and, from an older
 * migration, an `archived` flag. Everything that shows or sells a product
 * asks for `status = 'published'`; only the search index reads the flag.
 *
 * Archive used to flip the flag and nothing else, which went wrong both ways:
 *
 *   • A published product that was archived stayed published, so it stayed
 *     on the creator's page and in checkout, under a list that said it was
 *     "kept here, off your page".
 *   • A product whose status was "archived" showed Restore, and Restore set
 *     the flag to NOT the flag it had, which was true, so it stayed archived
 *     however many times it was pressed.
 *
 * Now, as in Shopify: Archive sets the status to archived (and the flag, for
 * the readers of the flag), so it is off every page at once. Restore clears
 * the flag, and a product whose status is archived comes back as a draft,
 * to be published again on purpose. A product archived by the flag alone
 * keeps the status it had.
 *
 * Both are decided by the row in the database, not by the page's copy of it,
 * and both answer with the row as it now is. An update that changes nothing
 * (a product that is gone, or not this person's under row level security)
 * throws rather than reporting a success that did not happen.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export interface ArchiveFields {
  status: string
  archived?: boolean | null
}

/** Archived by either mark: the flag, or the status. */
export function isArchivedProduct(p: ArchiveFields): boolean {
  return !!p.archived || p.status === "archived"
}

type Result = { data: unknown; error: { code?: string; message: string } | null }

function theRow(res: Result): { status: string; archived: boolean } {
  if (res.error) throw res.error
  const row = Array.isArray(res.data) ? (res.data[0] as { status?: unknown; archived?: unknown } | undefined) : undefined
  if (!row) throw new Error("That product could not be changed.")
  return { status: String(row.status ?? "draft"), archived: row.archived === true }
}

export async function archiveProduct(supabase: SupabaseClient, id: string): Promise<{ status: string; archived: boolean }> {
  let res: Result = await supabase.from("products").update({ status: "archived", archived: true }).eq("id", id).select("status, archived")
  /* 23514: a database whose status check predates "archived". A draft with the flag is off every page just the same. */
  if (res.error?.code === "23514") {
    res = await supabase.from("products").update({ status: "draft", archived: true }).eq("id", id).select("status, archived")
  }
  return theRow(res)
}

export async function restoreProduct(supabase: SupabaseClient, id: string): Promise<{ status: string; archived: boolean }> {
  /* "archived" has no state to go back to, so it comes back a draft. Only a row that is archived by status is touched. */
  const back: Result = await supabase.from("products").update({ status: "draft" }).eq("id", id).eq("status", "archived")
  if (back.error) throw back.error
  return theRow(await supabase.from("products").update({ archived: false }).eq("id", id).select("status, archived"))
}
