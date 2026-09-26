import type { ProductVariant } from "./editor-form"

/**
 * ===========================================================================
 *  A PRODUCT'S VARIANTS, SAVED IN A FEW ROUND TRIPS
 * ===========================================================================
 * The editor used to save its variants one after another, four requests
 * each (the row, its old files out, the product's files looked up, its new
 * files in), so seven variants were twenty-eight requests in a line before
 * Save could say it was done. Now:
 *
 *   1. the ids already saved for the product are read;
 *   2. the ones no longer in the form are deleted (their file links go with
 *      them), unless the form never had them to begin with (`keepUnlisted`:
 *      the editor could not read them when it opened, so an empty list there
 *      means "not read", not "all removed");
 *   3. every row is written at once, updated where it was saved before and
 *      inserted where it is new, its position the form's order;
 *   4. the file links for all of them are replaced in one delete and one
 *      insert, limited to files that really are the product's.
 *
 * What a row says is decided by variantRow alone, so a test can pin it. A
 * pay what you want variant is listed at its minimum, the way the product
 * itself is: price_cents is what the product page and a basket show for it.
 */

export interface VariantRow {
  product_id: string
  name: string
  description: string | null
  price_cents: number
  compare_at_price_cents: number | null
  max_purchases: number | null
  position: number
  pay_what_you_want: boolean
  pwyw_min_price_cents: number | null
  pwyw_suggested_price_cents: number | null
}

const cents = (typed: string | undefined | null): number | null => {
  if (!typed) return null
  const n = Math.round(Number.parseFloat(typed) * 100)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** The row one variant is saved as, at its place in the list. */
export function variantRow(productId: string, v: ProductVariant, position: number): VariantRow {
  const pwyw = !!v.payWhatYouWant
  const min = pwyw ? cents(v.pwywMinPrice) : null
  const price = pwyw ? (min ?? 0) : (cents(v.price) ?? 0)
  const compare = pwyw ? null : cents(v.compareAtPrice)
  const max = v.maxPurchases ? Number.parseInt(v.maxPurchases, 10) : NaN
  return {
    product_id: productId,
    name: v.name.trim() || "Untitled",
    description: v.description.trim() ? v.description : null,
    price_cents: price,
    /* Struck through only where it is a real discount on a fixed price, as the product's own compare at is. */
    compare_at_price_cents: compare !== null && compare > price ? compare : null,
    max_purchases: Number.isFinite(max) && max > 0 ? max : null,
    position,
    pay_what_you_want: pwyw,
    pwyw_min_price_cents: min,
    pwyw_suggested_price_cents: pwyw ? cents(v.pwywSuggestedPrice) : null,
  }
}

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
type DbError = { message?: string; code?: string } | null

/** The error a failed write is shown as, with the fixes the old save pointed at. */
function saveError(name: string, error: NonNullable<DbError>): Error {
  const msg = error.message || ""
  if (msg.includes("schema cache") || msg.includes("column") || msg.includes("does not exist")) {
    return new Error(`Database schema error: run supabase/sql/run-now/35_product_variants_columns.sql in the Supabase SQL editor, then refresh the page. (Error: ${msg})`)
  }
  if (error.code === "42501" || msg.includes("row-level security") || msg.includes("permission")) {
    return new Error("Permission denied saving variants. Check RLS policies for product_variants table.")
  }
  return new Error(`Failed to save variant "${name}": ${msg}`)
}

/**
 * Saves the form's variants for a product. Returns each variant's saved id
 * by the id it had in the form, so the form can take the saved ids without
 * relying on the list not having changed while the save ran.
 */
export async function saveVariants(
  supabase: Db,
  productId: string,
  variants: ProductVariant[],
  { keepUnlisted = false }: { keepUnlisted?: boolean } = {},
): Promise<Map<string, string>> {
  const { data: existingRows, error: readError } = await supabase.from("product_variants").select("id").eq("product_id", productId)
  /* Not knowing what is saved, nothing is deleted: a write below still says what is wrong. */
  const existing = new Set<string>(((existingRows as { id: string }[] | null) ?? []).map((r) => r.id))

  if (!readError && !keepUnlisted) {
    const listed = new Set(variants.map((v) => v.id))
    const gone = [...existing].filter((id) => !listed.has(id))
    if (gone.length > 0) {
      await supabase.from("product_variant_files").delete().in("variant_id", gone)
      const { error } = await supabase.from("product_variants").delete().in("id", gone)
      if (error) throw new Error(`Failed to delete variants: ${error.message}`)
    }
  }

  const written = await Promise.all(
    variants.map(async (v, i) => {
      const row = variantRow(productId, v, i)
      const query = existing.has(v.id)
        ? supabase.from("product_variants").update(row).eq("id", v.id).select("id").single()
        : supabase.from("product_variants").insert(row).select("id").single()
      const { data, error } = (await query) as { data: { id: string } | null; error: DbError }
      return { v, id: data?.id ?? null, error }
    }),
  )
  const failed = written.find((w) => w.error)
  if (failed?.error) throw saveError(failed.v.name, failed.error)

  const savedIds = new Map<string, string>()
  for (const w of written) if (w.id) savedIds.set(w.v.id, w.id)
  const saved = written.filter((w): w is typeof w & { id: string } => !!w.id)
  if (saved.length === 0) return savedIds

  /* The files each variant hands over, kept to the ones that are this product's. */
  const wanted = [...new Set(saved.flatMap((w) => w.v.assignedFiles ?? []))]
  let ours = new Set<string>()
  if (wanted.length > 0) {
    const { data: assets } = await supabase.from("digital_assets").select("id").eq("product_id", productId).in("id", wanted)
    ours = new Set(((assets as { id: string }[] | null) ?? []).map((a) => a.id))
  }
  await supabase.from("product_variant_files").delete().in("variant_id", saved.map((w) => w.id))
  const links = saved.flatMap((w) => [...new Set(w.v.assignedFiles ?? [])].filter((f) => ours.has(f)).map((f) => ({ variant_id: w.id, digital_asset_id: f })))
  if (links.length > 0) {
    const { error } = await supabase.from("product_variant_files").insert(links)
    if (error) console.error("Error saving variant files:", error)
  }

  /* A variant with six or more files gets its own ZIP, as before; it can be made again on the next save if this one fails. */
  for (const w of saved) {
    const count = (w.v.assignedFiles ?? []).filter((f) => ours.has(f)).length
    if (count >= 6) {
      fetch("/api/v2/upload/bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, variantId: w.id }),
      }).catch(() => {})
    }
  }
  return savedIds
}
