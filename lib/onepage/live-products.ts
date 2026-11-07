import {withVariantPrices, type VariantPriceFacts} from "@/lib/pricing/variant-price"
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
import { isPubliclyVisible, type VisibilityFields } from "@/lib/products/visibility"
import { sellsCommunity } from "@/lib/communities/listing"
import { planIntervals } from "@/lib/memberships/intervals"
import { offChannel } from "@/lib/store/channel-filter"

/** What a live product contributes to a block. */
export type LiveProduct = VariantPriceFacts & {
  id: string
  title?: string | null
  slug?: string | null
  price_cents?: number | null
  thumbnail_url?: string | null
  /** The cover as uploaded (SQL part 377), when the product has one. */
  cover_original_url?: string | null
  /** A "membership" is priced per month or year: its block says "$9/month". */
  type?: string | null
  price_interval?: "month" | "year" | null
  /** A sale's old price, and pay what you want with its minimum: the block's price says "From" or strikes the old one. */
  compare_at_cents?: number | null
  pay_what_you_want?: boolean | null
  pwyw_min_price_cents?: number | null
  /** A course's lessons, counted now; asked only when a course block names it. */
  lessons_count?: number | null
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
      } else if (block.type === "course") {
        /* A course block (components/onepage/creator-blocks): the same product row, read the same way. */
        const id = idOf(data.product_id)
        if (id) found.add(id)
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
    product_cover: product.cover_original_url ?? null,
    product_type: product.type ?? null,
    product_price_interval: product.price_interval ?? null,
    product_compare_at_cents: typeof product.compare_at_cents === "number" ? product.compare_at_cents : null,
    product_pwyw: product.pay_what_you_want === true,
    product_variant_min_cents: product.variant_min_price_cents,
    product_variant_max_cents: product.variant_max_price_cents,
    product_variant_count: product.variant_count,
    product_single_variant_id: product.single_variant_id,
    product_pwyw_min_cents: typeof product.pwyw_min_price_cents === "number" ? product.pwyw_min_price_cents : null,
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

      if (block.type === "course") {
        const id = idOf(data.product_id)
        if (!id || !answers.has(id)) {
          out.push(block)
          continue
        }
        const product = answers.get(id)
        /* Gone, archived, unpublished or not a course any more: the block leaves the page. */
        if (!product || (product.type && product.type !== "course")) continue
        out.push({
          ...block,
          data: {
            ...data,
            course_title: product.title ?? null,
            course_slug: product.slug ?? null,
            course_price_cents: typeof product.price_cents === "number" ? product.price_cents : null,
            course_thumbnail: product.thumbnail_url ?? null,
            lessons_count: typeof product.lessons_count === "number" ? product.lessons_count : data.lessons_count ?? null,
          },
        })
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

/* With the sale price and pay what you want (round 10), so "Free" is never said of a product with a minimum. */
const COLUMNS_WITH_PRICES = "id, title, slug, price_cents, thumbnail_url, type, status, archived, community_id, compare_at_cents, pay_what_you_want, pwyw_min_price_cents"
/* With the cover as uploaded (round AK, SQL part 377); before that part, the next list down. */
const COLUMNS_WITH_COVER = `${COLUMNS_WITH_PRICES}, cover_original_url`
/* With the column that marks a product selling a community tier, which a block does not show (lib/communities/listing). */
const COLUMNS_WITH_COMMUNITY = "id, title, slug, price_cents, thumbnail_url, type, status, archived, community_id"
const COLUMNS = "id, title, slug, price_cents, thumbnail_url, type, status, archived"
/* A database from before the archive flag. The status carries the same answer there. */
const COLUMNS_WITHOUT_FLAG = "id, title, slug, price_cents, thumbnail_url, type, status"

/** Live means published and not archived by the older flag: the one rule, lib/products/visibility.ts. */
function live(row: Record<string, unknown>): boolean {
  return isPubliclyVisible(row as VisibilityFields)
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
  for (const cols of [COLUMNS_WITH_COVER, COLUMNS_WITH_PRICES, COLUMNS_WITH_COMMUNITY, COLUMNS, COLUMNS_WITHOUT_FLAG]) {
    try {
      const [{ data, error }, offPage] = await Promise.all([db.from("products").select(cols).eq("creator_id", creatorId).in("id", asked), offChannel(db, creatorId, "creator_page")])
      if (error) continue
      const answers = new Map<string, LiveProduct | null>(asked.map((id) => [id, null]))
      for (const row of await withVariantPrices(db as never,(data ?? []).filter(row=>typeof row.id==="string").map(row=>({...row,id:String(row.id),community_id:typeof row.community_id==="string"?row.community_id:null})))) {
        const id = idOf(row.id)
        if (!id || !answers.has(id)) continue
        /* Settings › Sales channels: a product taken off the Creator page leaves its one page too. */
        answers.set(id, live({...row}) && !sellsCommunity(row) && !offPage.has(id) ? (row as LiveProduct) : null)
      }
      /* A yearly only membership says "/year" (lib/memberships/intervals); asked only when a block names a membership. */
      const memberships = [...answers.values()].filter((p): p is LiveProduct => !!p && p.type === "membership")
      if (memberships.length > 0) {
        const intervals = await planIntervals(db as never, memberships.map((p) => p.id))
        for (const p of memberships) answers.set(p.id, { ...p, price_interval: intervals.get(p.id) ?? "month" })
      }
      /* A course's lessons, counted (course, its modules, their lessons); a read that fails keeps the block's own count. */
      const courses = [...answers.values()].filter((p): p is LiveProduct => !!p && p.type === "course")
      if (courses.length > 0) {
        const counts = await lessonCounts(db, courses.map((p) => p.id))
        for (const p of courses) if (counts.has(p.id)) answers.set(p.id, { ...p, lessons_count: counts.get(p.id) ?? null })
      }
      return answers
    } catch {
      /* Try the narrower column list, then give up and answer about nothing. */
    }
  }
  return new Map()
}

/** How many lessons each course product has, for the ones that could be read. Never throws. */
export async function lessonCounts(db: ProductsDb, productIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (productIds.length === 0) return out
  /* The narrow type above is the products read; these three are plain reads by id. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = db as any
  try {
    const { data: courses, error } = await q.from("courses").select("id, product_id").in("product_id", productIds)
    if (error || !Array.isArray(courses)) return out
    const productOf = new Map<string, string>((courses as { id: string; product_id: string }[]).map((c) => [c.id, c.product_id]))
    for (const c of courses as { product_id: string }[]) out.set(c.product_id, 0)
    if (productOf.size === 0) return out
    const { data: modules, error: mErr } = await q.from("course_modules").select("id, course_id").in("course_id", [...productOf.keys()])
    if (mErr || !Array.isArray(modules)) return new Map()
    const moduleProduct = new Map<string, string | undefined>((modules as { id: string; course_id: string }[]).map((m) => [m.id, productOf.get(m.course_id)]))
    if (moduleProduct.size === 0) return out
    const { data: lessons, error: lErr } = await q.from("course_lessons").select("module_id").in("module_id", [...moduleProduct.keys()])
    if (lErr || !Array.isArray(lessons)) return new Map()
    for (const l of lessons as { module_id: string }[]) {
      const p = moduleProduct.get(l.module_id)
      if (p) out.set(p, (out.get(p) ?? 0) + 1)
    }
    return out
  } catch {
    return new Map()
  }
}

/** The page's blocks, with every product read from the product row. */
export async function withLiveProducts<T>(db: ProductsDb, creatorId: string, blocks: T): Promise<T> {
  return resolveProductBlocks(blocks, await answersForBlocks(db, creatorId, blocks))
}
