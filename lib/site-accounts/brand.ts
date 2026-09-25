/**
 * The name a creator's website goes by, as its visitors see it: the store
 * name set in the builder's Branding, then the creator's display name. What
 * storelib.com shows on the "Continue to <store>" page and in the emails a
 * website sends, so a visitor recognises the shop they were on.
 */

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export async function siteBrandName(db: Db, creatorId: string): Promise<string> {
  try {
    const { data: install } = await db
      .from("store_theme_installs")
      .select("id, store_theme_settings ( settings )")
      .eq("creator_id", creatorId)
      .eq("status", "published")
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle()
    const raw = (install as { store_theme_settings?: unknown } | null)?.store_theme_settings
    const row = Array.isArray(raw) ? raw[0] : raw
    const brand = (row as { settings?: { brand_name?: unknown } } | null)?.settings?.brand_name
    if (typeof brand === "string" && brand.trim()) return brand.trim().slice(0, 80)
  } catch {
    /* The creator's own name below. */
  }
  try {
    const { data: creator } = await db.from("creators").select("display_name, slug").eq("id", creatorId).maybeSingle()
    const c = creator as { display_name?: string | null; slug?: string | null } | null
    const name = (c?.display_name || c?.slug || "").trim()
    if (name) return name.slice(0, 80)
  } catch {
    /* A plain word below. */
  }
  return "this store"
}
