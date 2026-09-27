/**
 * ===========================================================================
 *  A ONEPAGE'S PRODUCTS, READ FROM THE PRODUCT AND NOT FROM A COPY OF IT
 * ===========================================================================
 * A product block keeps the product's id AND a copy of what it looked like
 * when it was added: `product_title`, `product_thumbnail`,
 * `product_price_cents`, `product_slug` (lib/onepage/types.ts). Publishing
 * copies the whole block array into `onepages.published_blocks`, so the copy
 * is then frozen twice over.
 *
 * Nothing read the product row again. Delete the product and the row on the
 * live page kept its picture, its title and its price, and its button went
 * on pointing at /p/<slug>, which is now a 404. That is the report: "If I
 * deleted that product why is it still showing?"
 *
 * The answer is not to sweep the copies up after each delete and hope no
 * path is missed. A copy that has to be kept in step with the row is a
 * second source of truth, and it drifts on a price change, a rename, a new
 * cover picture, an archive and a restore, not only on a delete. So the
 * page resolves each block against the product as it is NOW, every time it
 * renders:
 *
 *   gone, archived, or not published   the block is left out of the page
 *   live                               its title, price, picture and address
 *                                      come from the row, not from the copy
 *
 * The block's own styling is untouched, and so is anything the creator typed
 * over the product: `custom_thumbnail` still wins over the product's cover,
 * and `product_description` stays as the editor shortened it.
 *
 * FAIL OPEN. A product this file was not asked about, or could not read, is
 * left exactly as it is. A page whose catalogue could not be reached draws
 * what it drew yesterday rather than emptying itself.
 */

/** What a live product contributes to a block. */
export type LiveProduct = {
  id: string
  title?: string | null
  slug?: string | null
  price_cents?: number | null
  thumbnail_url?: string | null
}

/**
 * The answer for one product id:
 *
 *   a row    it is live; refresh the block from it
 *   null     it is gone, archived, or not published; take the block out
 *   absent   not asked about, or not answered; leave the block alone
 */
export type ProductAnswers = ReadonlyMap<string, LiveProduct | null>

type Block = { type?: string; data?: Record<string, unknown> | null; [key: string]: unknown }

const idOf = (v: unknown): string => (typeof v === "string" ? v.trim() : "")

/** Every product a block array names, blocks inside a group included. */
export function productIdsInBlocks(blocks: unknown): string[] {
  const found = new Set<string>()
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return
    for (const raw of list) {
      const block = raw as Block | null
      if (!block || typeof block !== "object") continue
      const data = (block.data ?? {}) as Record<string, unknown>
      if (block.type === "product") {
        const id = idOf(data.product_id)
        if (id) found.add(id)
      } else if (block.type === "email_capture") {
        const id = idOf(data.digital_product_id)
        if (id && data.enable_digital_product !== false) found.add(id)
      } else if (block.type === "group") {
        walk(data.children)
      }
    }
  }
  walk(blocks)
  return [...found]
}

/** The price, title and picture as the product has them now. */
function refreshed(data: Record<string, unknown>, product: LiveProduct): Record<string, unknown> {
  return {
    ...data,
    product_title: product.title ?? null,
    product_slug: product.slug ?? null,
    product_price_cents: typeof product.price_cents === "number" ? product.price_cents : null,
    product_thumbnail: product.thumbnail_url ?? null,
  }
}

/**
 * An email capture block that promised a download the product no longer
 * gives. The block still collects addresses, because that is its job; it
 * just stops offering the file.
 */
function withoutDelivery(data: Record<string, unknown>): Record<string, unknown> {
  return {
    ...data,
    enable_digital_product: false,
    digital_product_id: null,
    digital_product_title: null,
    digital_product_thumbnail: null,
    digital_product_file_url: null,
  }
}

/**
 * The blocks a visitor should see, given what the catalogue says about each
 * product they name. Pure, and it never mutates what it was given.
 */
export function resolveProductBlocks<T>(blocks: T, answers: ProductAnswers): T {
  if (!Array.isArray(blocks)) return blocks
  const walk = (list: unknown[]): unknown[] => {
    const out: unknown[] = []
    for (const raw of list) {
      const block = raw as Block | null
      if (!block || typeof block !== "object") {
        out.push(raw)
        continue
      }
      const data = (block.data ?? {}) as Record<string, unknown>

      if (block.type === "product") {
        const id = idOf(data.product_id)
        if (!id || !answers.has(id)) {
          out.push(block)
          continue
        }
        const product = answers.get(id)
        /* Gone, archived or unpublished: the row leaves the page entirely. */
        if (!product) continue
        out.push({ ...block, data: refreshed(data, product) })
        continue
      }

      if (block.type === "email_capture") {
        const id = idOf(data.digital_product_id)
        if (!id || data.enable_digital_product === false || !answers.has(id)) {
          out.push(block)
          continue
        }
        out.push(answers.get(id) ? block : { ...block, data: withoutDelivery(data) })
        continue
      }

      if (block.type === "group" && Array.isArray(data.children)) {
        out.push({ ...block, data: { ...data, children: walk(data.children) } })
        continue
      }

      out.push(block)
    }
    return out
  }
  return walk(blocks) as unknown as T
}

/** Every mention of one product taken out, for a product that has been deleted. */
export function withoutProduct<T>(blocks: T, productId: string): T {
  const id = idOf(productId)
  if (!id) return blocks
  return resolveProductBlocks(blocks, new Map([[id, null]]))
}

/**
 * ---------------------------------------------------------------------------
 *  THE CATALOGUE READ, NARROW ENOUGH FOR A TEST TO STAND IN FOR IT
 * ---------------------------------------------------------------------------
 * The same shape storefront-data-server uses: only what this needs, so a
 * test can hand in a fake without a database.
 */
type Rows = { data: Record<string, unknown>[] | null; error?: { message: string } | null }
export type ProductsDb = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        in: (col: string, vals: string[]) => PromiseLike<Rows>
      }
    }
  }
}

const COLUMNS = "id, title, slug, price_cents, thumbnail_url, status, archived"
/* A database from before the archive flag. The status carries the same answer there. */
const COLUMNS_WITHOUT_FLAG = "id, title, slug, price_cents, thumbnail_url, status"

/** Live means published, this creator's, and not archived by the older flag. */
function live(row: Record<string, unknown>): boolean {
  return row.status === "published" && row.archived !== true
}

/**
 * What the catalogue says about the products a page names. Answers only for
 * ids it was asked about and got a reply for: a read that fails answers
 * about nothing, so the page keeps its blocks.
 */
export async function answersForBlocks(db: ProductsDb, creatorId: string, blocks: unknown): Promise<ProductAnswers> {
  const ids = productIdsInBlocks(blocks)
  if (!creatorId || ids.length === 0) return new Map()
  const asked = ids.slice(0, 200)
  for (const cols of [COLUMNS, COLUMNS_WITHOUT_FLAG]) {
    try {
      const { data, error } = await db.from("products").select(cols).eq("creator_id", creatorId).in("id", asked)
      if (error) continue
      const answers = new Map<string, LiveProduct | null>(asked.map((id) => [id, null]))
      for (const row of data ?? []) {
        const id = idOf(row.id)
        if (!id || !answers.has(id)) continue
        answers.set(id, live(row) ? (row as LiveProduct) : null)
      }
      return answers
    } catch {
      /* Try the narrower column list, then give up and answer about nothing. */
    }
  }
  return new Map()
}

/** The page's blocks, with every product read from the product row. */
export async function withLiveProducts<T>(db: ProductsDb, creatorId: string, blocks: T): Promise<T> {
  return resolveProductBlocks(blocks, await answersForBlocks(db, creatorId, blocks))
}
