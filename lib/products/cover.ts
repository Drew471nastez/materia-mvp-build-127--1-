/**
 * ===========================================================================
 *  THE COVER AS UPLOADED (round AK, SQL part 377)
 * ===========================================================================
 * A download's or course's cover is stored twice by the product editor:
 *
 *   thumbnail_url        a 1280x720 copy with light grey padding around a portrait cover, for the shop's 16:9 cards
 *                        (Explore, the marketplace, a store's grid), where every card is the same shape
 *   cover_original_url   the picture as it was chosen, for the places that frame it in its own shape: the OnePage
 *                        (block, sheet, full screen, instant checkout), the product page and the checkout
 *
 * Before part 377 has run, or for a product saved before it, there is no original: those places then cut the
 * padding off the copy in the browser (lib/images/letterbox).
 */

type CoverFields = { thumbnail_url?: string | null; cover_original_url?: string | null }

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)

/** The product's own picture: the original upload when there is one, else the card copy. */
export function productCover(row: CoverFields | null | undefined): string | null {
  return text(row?.cover_original_url) ?? text(row?.thumbnail_url)
}

/**
 * A gallery list with the card copy swapped for the original wherever it stands, each picture once. A list without
 * the card copy gets the original nowhere: it is the cover's own place in the list that it takes.
 */
export function withOriginalCover(urls: readonly (string | null | undefined)[], row: CoverFields | null | undefined): string[] {
  const thumb = text(row?.thumbnail_url)
  const original = text(row?.cover_original_url)
  const out: string[] = []
  for (const u of urls) {
    const url = text(u)
    if (!url) continue
    const shown = original && thumb && url === thumb ? original : url
    if (!out.includes(shown)) out.push(shown)
  }
  return out
}

/* ---------------------------------------------------------------------------
 *  EVERYWHERE BUT EXPLORE (round AL)
 * ---------------------------------------------------------------------------
 * The owner: only Explore and the marketplace show the padded 16:9 copy. Every other place a product's picture is
 * drawn (a website's sections, the store's grid, the library, the editor) shows the picture as uploaded. Most of those
 * read their rows with column lists that a database before part 377 must still answer, so the original is read in a
 * request of its own and laid over the rows: a database without the column, or a read that fails, leaves every row as
 * it was (and the page's own trim, lib/images/cover-trim, cuts the padding off in the browser instead).
 */

type OriginalsDb = { from: (table: string) => { select: (cols: string) => unknown } }
type Batch = PromiseLike<{ data: unknown[] | null; error?: unknown }>

/** Each product's cover as uploaded, by id: only the products that have one. Never throws. */
export async function originalCoversOf(db: unknown, productIds: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = [...new Set(productIds.filter((id): id is string => typeof id === "string" && id.length > 0))]
  if (ids.length === 0 || !db) return out
  try {
    for (let i = 0; i < ids.length; i += 80) {
      const query = (db as OriginalsDb).from("products").select("id, cover_original_url") as { in?: (col: string, vals: string[]) => Batch }
      if (typeof query?.in !== "function") return out
      const { data, error } = await query.in("id", ids.slice(i, i + 80))
      /* Before part 377 the column is not there: nothing to lay over. */
      if (error) return out
      for (const row of (data ?? []) as { id?: unknown; cover_original_url?: unknown }[]) {
        const original = text(row?.cover_original_url)
        if (typeof row?.id === "string" && original) out.set(row.id, original)
      }
    }
  } catch {
    /* A read that fails draws what it drew: the trim in the browser still keeps the bars off. */
  }
  return out
}

/*
 * The editor names both files of one upload with the same time (`<ms>_name_processed.jpg` and `<ms>_original_name.png`,
 * product-editor.tsx). An original from another upload than the cover now in place (a save that moved the first photo
 * but could not write the column) is not drawn for it.
 */
function sameUpload(thumb: string, original: string): boolean {
  const stamp = (u: string) => /\/(\d{12,14})_[^/]*$/.exec(u.split(/[?#]/)[0])?.[1] ?? null
  const a = stamp(thumb)
  const b = stamp(original)
  return !a || !b || a === b
}

type RowWithCover = { id?: string | null; thumbnail_url?: string | null; cover_original_url?: string | null; gallery_urls?: unknown }

/**
 * A row as it is drawn outside Explore: `thumbnail_url` is the cover as uploaded, and its place in `gallery_urls` too
 * (each picture once). `cover_original_url` stays, so a caller can still tell. A row with no original is returned as it is.
 */
export function withOriginalCoverRow<T extends RowWithCover>(row: T, original?: string | null): T & { cover_original_url?: string | null } {
  const own = text(original) ?? text(row.cover_original_url)
  const thumb = text(row.thumbnail_url)
  if (!own || !thumb || own === thumb || !sameUpload(thumb, own)) return row
  const fields = { thumbnail_url: thumb, cover_original_url: own }
  const gallery = Array.isArray(row.gallery_urls) ? withOriginalCover(row.gallery_urls as (string | null | undefined)[], fields) : row.gallery_urls
  return { ...row, thumbnail_url: own, cover_original_url: own, ...(Array.isArray(row.gallery_urls) ? { gallery_urls: gallery } : {}) }
}

/** Rows with their originals read and laid over (originalCoversOf, withOriginalCoverRow). Never throws. */
export async function rowsWithOriginalCovers<T extends RowWithCover>(db: unknown, rows: readonly T[]): Promise<T[]> {
  if (rows.length === 0) return [...rows]
  const originals = await originalCoversOf(db, rows.map((r) => r.id))
  return rows.map((r) => withOriginalCoverRow(r, typeof r.id === "string" ? originals.get(r.id) : null))
}
